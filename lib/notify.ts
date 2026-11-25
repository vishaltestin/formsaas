import "server-only"

import { activeEmailProvider, defaultFrom, deliver, deliverVia, withFromName, type EmailProvider } from "@/lib/email/transport"
import { loadWorkspaceRoute } from "@/lib/email/workspace-provider"
import { prisma } from "@/lib/prisma"

export { escapeHtml } from "@/lib/email/escape"

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type SendEmailResult = {
  sent: boolean
  reason: "ok" | "no-recipients" | "not-configured" | "error"
  provider: EmailProvider
  /** "workspace" = the client's own provider, "platform" = env configuration */
  via: "workspace" | "platform"
  id: string | null
  error?: string
}

/**
 * Transactional email with a durable outbox. Every message is written to
 * `EmailOutbox` first, then delivered through the configured provider
 * (Brevo, Mailtrap or SMTP, see lib/email/providers.ts). Without a provider the
 * message is marked LOGGED so local development never fails and every
 * email stays inspectable in Admin → Email.
 *
 * With `workspaceId`, the workspace's own provider (Settings → Email delivery)
 * is used when it has one enabled; otherwise the platform provider.
 */
export async function sendEmail(input: {
  to: string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  fromName?: string
  source?: string
  workspaceId?: string | null
}): Promise<SendEmailResult> {
  const route = input.workspaceId ? await loadWorkspaceRoute(input.workspaceId) : null
  const via = route ? "workspace" : "platform"
  const provider = (route ? route.label : activeEmailProvider()) as EmailProvider
  const to = Array.from(new Set(input.to.map((e) => e.trim()).filter((e) => EMAIL_RE.test(e)))).slice(0, 50)
  if (to.length === 0) return { sent: false, reason: "no-recipients", provider, via, id: null }
  const replyTo = input.replyTo && EMAIL_RE.test(input.replyTo.trim()) ? input.replyTo.trim() : undefined
  const subject = input.subject.replace(/[\r\n]+/g, " ").slice(0, 500)
  const row = await prisma.emailOutbox
    .create({
      data: {
        to,
        subject,
        html: input.html.slice(0, 1_000_000),
        replyTo: replyTo ?? null,
        source: input.source?.slice(0, 120) ?? null,
        workspaceId: route ? input.workspaceId : null,
      },
    })
    .catch(() => null)

  if (route) {
    const res = route.ok
      ? await deliverVia(route.provider, {
          from: withFromName(route.from, input.fromName),
          to,
          subject,
          html: input.html,
          text: input.text,
          replyTo: replyTo ?? route.replyTo ?? undefined,
          category: input.source?.split(":")[0],
        })
      : ({ ok: false, error: route.error } as const)
    if (row)
      await prisma.emailOutbox
        .update({
          where: { id: row.id },
          data: res.ok
            ? { status: "SENT", provider: `${provider} (workspace)`, error: null, sentAt: new Date(), messageId: res.messageId?.slice(0, 255) ?? null }
            : { status: "FAILED", provider: `${provider} (workspace)`, error: res.error.slice(0, 1000) },
        })
        .catch(() => undefined)
    if (!res.ok && input.workspaceId)
      await prisma.workspaceEmailProvider.update({ where: { workspaceId: input.workspaceId }, data: { lastError: res.error.slice(0, 1000) } }).catch(() => undefined)
    return res.ok
      ? { sent: true, reason: "ok", provider, via, id: row?.id ?? null }
      : { sent: false, reason: "error", provider, via, id: row?.id ?? null, error: res.error }
  }

  if (provider === "log") {
    if (row) await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "LOGGED", provider: "log" } }).catch(() => undefined)
    if (process.env.NODE_ENV !== "test") console.info(`[email] no provider configured — logged "${subject}" to ${to.join(", ")}`)
    return { sent: false, reason: "not-configured", provider, via, id: row?.id ?? null }
  }

  const res = await deliver(provider, {
    from: withFromName(defaultFrom(), input.fromName),
    to,
    subject,
    html: input.html,
    text: input.text,
    replyTo,
    category: input.source?.split(":")[0],
  })
  if (row)
    await prisma.emailOutbox
      .update({
        where: { id: row.id },
        data: res.ok
          ? { status: "SENT", provider, error: null, sentAt: new Date(), messageId: res.messageId?.slice(0, 255) ?? null }
          : { status: "FAILED", provider, error: res.error.slice(0, 1000) },
      })
      .catch(() => undefined)
  return res.ok
    ? { sent: true, reason: "ok", provider, via, id: row?.id ?? null }
    : { sent: false, reason: "error", provider, via, id: row?.id ?? null, error: res.error }
}
