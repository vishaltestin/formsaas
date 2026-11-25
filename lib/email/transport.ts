import "server-only"

import { BrevoClient, BrevoError } from "@getbrevo/brevo"
import { MailtrapClient } from "mailtrap"
import nodemailer, { type Transporter } from "nodemailer"

import { mailtrapInboxId, mailtrapSandbox, parseAddress, type EmailProvider } from "@/lib/email/providers"
import type { ResolvedProvider } from "@/lib/email/workspace-config"
import { resolvePublicHost, UnsafeHostError } from "@/lib/security/network"

/**
 * Delivery through the provider chosen in lib/email/providers.ts:
 * Brevo (official SDK), Mailtrap (official SDK, live or sandbox), SMTP via
 * Nodemailer, or "log" (outbox only — handled by lib/notify.ts).
 */

export { activeEmailProvider, defaultFrom, providerDescription, withFromName, type EmailProvider } from "@/lib/email/providers"

export interface OutgoingEmail {
  from: string
  to: string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  /** Free-form label, e.g. "receipt" or "notify" — sent as a Brevo tag / Mailtrap category. */
  category?: string
}

export type DeliveryResult = { ok: true; messageId: string | null } | { ok: false; error: string }

let smtp: Transporter | null = null
function smtpTransport() {
  if (smtp) return smtp
  smtp = process.env.SMTP_URL
    ? nodemailer.createTransport(process.env.SMTP_URL)
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
      })
  return smtp
}

let brevo: BrevoClient | null = null
function brevoClient() {
  brevo ??= new BrevoClient({ apiKey: process.env.BREVO_API_KEY ?? "", maxRetries: 2, timeoutInSeconds: 20 })
  return brevo
}

let mailtrap: MailtrapClient | null = null
function mailtrapClient() {
  if (mailtrap) return mailtrap
  const sandbox = mailtrapSandbox()
  mailtrap = new MailtrapClient({
    token: process.env.MAILTRAP_API_KEY ?? "",
    ...(sandbox ? { sandbox: true, testInboxId: mailtrapInboxId() } : {}),
  })
  return mailtrap
}

function errorMessage(e: unknown) {
  if (e instanceof BrevoError) {
    const body = e.body && typeof e.body === "object" && "message" in e.body ? String((e.body as { message: unknown }).message) : e.message
    return `Brevo ${e.statusCode ?? ""} ${body}`.replace(/\s+/g, " ").trim()
  }
  if (e && typeof e === "object" && "response" in e) {
    // Mailtrap SDK errors wrap the axios response: { errors: [...] } or { error: "..." }.
    const data = (e as { response?: { status?: number; data?: { errors?: unknown; error?: unknown } } }).response
    const detail = data?.data?.errors ?? data?.data?.error
    if (detail) return `Mailtrap ${data?.status ?? ""} ${Array.isArray(detail) ? detail.join(", ") : String(detail)}`.trim()
  }
  return e instanceof Error ? e.message : "send failed"
}

async function sendBrevo(client: BrevoClient, msg: OutgoingEmail): Promise<DeliveryResult> {
  const res = await client.transactionalEmails.sendTransacEmail({
    sender: parseAddress(msg.from),
    to: msg.to.map((email) => ({ email })),
    subject: msg.subject,
    htmlContent: msg.html,
    textContent: msg.text,
    ...(msg.replyTo ? { replyTo: parseAddress(msg.replyTo) } : {}),
    ...(msg.category ? { tags: [msg.category] } : {}),
  })
  return { ok: true, messageId: res.messageId ?? res.messageIds?.[0] ?? null }
}

async function sendMailtrap(client: MailtrapClient, msg: OutgoingEmail): Promise<DeliveryResult> {
  const res = await client.send({
    from: parseAddress(msg.from),
    to: msg.to.map((email) => ({ email })),
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    ...(msg.replyTo ? { reply_to: parseAddress(msg.replyTo) } : {}),
    ...(msg.category ? { category: msg.category } : {}),
  })
  return res.success ? { ok: true, messageId: res.message_ids?.[0] ?? null } : { ok: false, error: "Mailtrap rejected the message" }
}

async function sendSmtp(transport: Transporter, msg: OutgoingEmail): Promise<DeliveryResult> {
  const info = await transport.sendMail({
    from: msg.from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    replyTo: msg.replyTo,
  })
  return { ok: true, messageId: info.messageId ?? null }
}

/** Platform delivery using the provider configured in the environment. */
export async function deliver(provider: EmailProvider, msg: OutgoingEmail): Promise<DeliveryResult> {
  try {
    if (provider === "brevo") return await sendBrevo(brevoClient(), msg)
    if (provider === "mailtrap") return await sendMailtrap(mailtrapClient(), msg)
    if (provider === "smtp") return await sendSmtp(smtpTransport(), msg)
    return { ok: false, error: "not-configured" }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}

/**
 * Delivery through a workspace's own provider. Clients are created per call
 * (credentials never outlive the request). SMTP hosts pass the SSRF guard and
 * the connection goes to the vetted IP with TLS SNI/verification on the name.
 */
export async function deliverVia(provider: ResolvedProvider, msg: OutgoingEmail): Promise<DeliveryResult> {
  try {
    if (provider.kind === "brevo") return await sendBrevo(new BrevoClient({ apiKey: provider.apiKey, maxRetries: 1, timeoutInSeconds: 20 }), msg)
    if (provider.kind === "mailtrap")
      return await sendMailtrap(
        new MailtrapClient({ token: provider.apiKey, ...(provider.sandbox ? { sandbox: true, testInboxId: provider.inboxId } : {}) }),
        msg
      )
    const address = await resolvePublicHost(provider.host)
    const transport = nodemailer.createTransport({
      host: address,
      port: provider.port,
      secure: provider.secure,
      requireTLS: !provider.secure && provider.port !== 25,
      auth: provider.username ? { user: provider.username, pass: provider.password ?? "" } : undefined,
      tls: { servername: provider.host, minVersion: "TLSv1.2" },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
    try {
      return await sendSmtp(transport, msg)
    } finally {
      transport.close()
    }
  } catch (e) {
    if (e instanceof UnsafeHostError) return { ok: false, error: e.message }
    return { ok: false, error: errorMessage(e) }
  }
}
