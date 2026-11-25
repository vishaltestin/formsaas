/**
 * Email provider selection — pure functions (no SDK imports) so they can be
 * unit tested and shared by the admin page, server actions and the transport.
 *
 *   BREVO_API_KEY=xkeysib-...             → Brevo transactional API (@getbrevo/brevo)
 *   MAILTRAP_API_KEY=...                  → Mailtrap Email API (mailtrap SDK)
 *     MAILTRAP_USE_SANDBOX=true + MAILTRAP_INBOX_ID=123 → Mailtrap test inbox
 *   SMTP_URL=smtps://user:pass@host:465   → any SMTP server via Nodemailer
 *     (or SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE)
 *   none                                  → "log": stored in the outbox only
 *
 * EMAIL_PROVIDER=brevo|mailtrap|smtp|log forces one. Without it the first
 * configured provider wins, in the order above.
 */

export const EMAIL_PROVIDERS = ["brevo", "mailtrap", "smtp", "log"] as const
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number]

type Env = Record<string, string | undefined>

export const PROVIDER_LABELS: Record<EmailProvider, string> = {
  brevo: "Brevo",
  mailtrap: "Mailtrap",
  smtp: "SMTP",
  log: "Outbox only",
}

export function mailtrapSandbox(env: Env = process.env) {
  return env.MAILTRAP_USE_SANDBOX === "true" || env.MAILTRAP_USE_SANDBOX === "1"
}

/** The sandbox inbox id; MAILTRAP_SANDBOX_ID (the SDK's own convention) is accepted as an alias. */
export function mailtrapInboxId(env: Env = process.env): number | undefined {
  const raw = env.MAILTRAP_INBOX_ID || env.MAILTRAP_SANDBOX_ID
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : undefined
}

export function providerConfigured(p: EmailProvider, env: Env = process.env): boolean {
  switch (p) {
    case "brevo":
      return !!env.BREVO_API_KEY
    case "mailtrap":
      // Sandbox sending needs to know which test inbox receives the message.
      return !!env.MAILTRAP_API_KEY && (!mailtrapSandbox(env) || mailtrapInboxId(env) !== undefined)
    case "smtp":
      return !!(env.SMTP_URL || env.SMTP_HOST)
    case "log":
      return true
  }
}

export function activeEmailProvider(env: Env = process.env): EmailProvider {
  const forced = env.EMAIL_PROVIDER?.trim().toLowerCase() as EmailProvider | undefined
  if (forced && (EMAIL_PROVIDERS as readonly string[]).includes(forced) && providerConfigured(forced, env)) return forced
  for (const p of EMAIL_PROVIDERS) if (providerConfigured(p, env)) return p
  return "log"
}

/** Human description of where mail goes, used in the admin and in toasts. */
export function providerDescription(p: EmailProvider, env: Env = process.env) {
  if (p === "mailtrap") return mailtrapSandbox(env) ? "Mailtrap (sandbox inbox)" : "Mailtrap"
  return PROVIDER_LABELS[p]
}

/** Default sender. Brevo and Mailtrap both require a verified sender or domain. */
export function defaultFrom(env: Env = process.env) {
  return env.EMAIL_FROM || env.NOTIFY_FROM_EMAIL || "Digital Fueled <no-reply@digitalfueled.app>"
}

/** "Display Name <addr>" with the name replaced; keeps the configured address. */
export function withFromName(from: string, name?: string) {
  const clean = name?.replace(/[<>"\r\n]/g, "").trim()
  if (!clean) return from
  const addr = /<([^>]+)>/.exec(from)?.[1] ?? from.trim()
  return `"${clean}" <${addr}>`
}

/** Splits `"Name" <a@b.c>` / `Name <a@b.c>` / `a@b.c` into the object shape the HTTP APIs expect. */
export function parseAddress(input: string): { email: string; name?: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(input)
  if (!m) return { email: input.trim() }
  const name = m[1].trim()
  return name ? { email: m[2].trim(), name } : { email: m[2].trim() }
}
