import type { Metadata } from "next"

import { EmailOutboxTable, type OutboxRow } from "@/components/admin/email-outbox"
import { PageHeader } from "@/components/app/page-header"
import { activeEmailProvider, defaultFrom, mailtrapSandbox, providerDescription, type EmailProvider } from "@/lib/email/providers"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/session"

export const metadata: Metadata = { title: "Email delivery" }

function providerBody(p: EmailProvider) {
  switch (p) {
    case "brevo":
      return "Emails are delivered through the Brevo transactional API using BREVO_API_KEY. The sender address must be verified in Brevo."
    case "mailtrap":
      return mailtrapSandbox()
        ? "Mailtrap sandbox: emails are captured in your Mailtrap test inbox (MAILTRAP_INBOX_ID) and never reach real recipients."
        : "Emails are delivered through the Mailtrap Email API using MAILTRAP_API_KEY from a verified sending domain."
    case "smtp":
      return "Emails are delivered through your SMTP server (SMTP_URL or SMTP_HOST). Brevo and Mailtrap SMTP relays work here too."
    case "log":
      return "No provider is configured, so emails are stored here but not delivered. Set BREVO_API_KEY or MAILTRAP_API_KEY and restart the server."
  }
}

export default async function AdminEmailsPage() {
  await requireAdmin()
  const provider = activeEmailProvider()
  const [rows, counts] = await Promise.all([
    prisma.emailOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.emailOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
  ])
  const items: OutboxRow[] = rows.map((r) => ({
    id: r.id,
    to: Array.isArray(r.to) ? (r.to as string[]) : [],
    subject: r.subject,
    html: r.html,
    status: r.status,
    provider: r.provider,
    messageId: r.messageId,
    error: r.error,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  }))
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0
  const copy = { label: providerDescription(provider), body: providerBody(provider) }
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <PageHeader title="Email delivery" description="Thank-you emails, response notifications and workflow emails, with their delivery status." />
      <section className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="bg-card p-5">
          <p className="text-xs text-muted-foreground">Active provider</p>
          <p className="mt-1 text-lg font-semibold">{copy.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
          <p className="mt-3 font-mono text-xs text-muted-foreground">From: {defaultFrom()}</p>
        </div>
        {[
          ["Sent", count("SENT")],
          ["Stored only", count("LOGGED")],
          ["Failed", count("FAILED")],
        ].map(([label, n]) => (
          <div key={label} className="bg-card p-5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{n}</p>
          </div>
        ))}
      </section>
      <EmailOutboxTable rows={items} />
    </div>
  )
}
