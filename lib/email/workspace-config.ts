import { z } from "zod"

/**
 * Bring-your-own email provider: form schema + shapes shared by the settings
 * UI, the server action and the transport. Secrets (API key / SMTP password)
 * are only ever written; the browser receives a masked hint.
 */

export const WORKSPACE_PROVIDERS = ["BREVO", "MAILTRAP", "SMTP"] as const
export type WorkspaceProviderKind = (typeof WORKSPACE_PROVIDERS)[number]

export const WORKSPACE_PROVIDER_LABELS: Record<WorkspaceProviderKind, string> = {
  BREVO: "Brevo",
  MAILTRAP: "Mailtrap",
  SMTP: "SMTP server",
}

export const SMTP_PORTS = [25, 465, 587, 2525] as const

const email = z.string().trim().toLowerCase().max(254).email("Enter a valid email address")

export const providerFormSchema = z
  .object({
    provider: z.enum(WORKSPACE_PROVIDERS),
    enabled: z.boolean(),
    fromEmail: email,
    fromName: z.string().trim().max(80).regex(/^[^<>"\r\n]*$/, "Remove < > and quotes").default(""),
    replyTo: z.union([email, z.literal("")]).default(""),
    /** Brevo / Mailtrap API token. Empty = keep the stored one. */
    apiKey: z.string().trim().max(400).default(""),
    sandbox: z.boolean().default(false),
    inboxId: z.string().trim().regex(/^\d*$/, "Inbox id is a number").max(18).default(""),
    host: z.string().trim().toLowerCase().max(253).default(""),
    port: z.number().int().default(587),
    secure: z.boolean().default(false),
    username: z.string().trim().max(254).default(""),
    /** SMTP password. Empty = keep the stored one. */
    password: z.string().max(400).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.provider === "MAILTRAP" && v.sandbox && !v.inboxId)
      ctx.addIssue({ code: "custom", path: ["inboxId"], message: "Sandbox sending needs the test inbox id" })
    if (v.provider === "SMTP") {
      if (!v.host) ctx.addIssue({ code: "custom", path: ["host"], message: "SMTP host is required" })
      if (!(SMTP_PORTS as readonly number[]).includes(v.port))
        ctx.addIssue({ code: "custom", path: ["port"], message: `Use port ${SMTP_PORTS.join(", ")}` })
    }
  })
export type ProviderFormValues = z.input<typeof providerFormSchema>

/** Non-secret settings persisted in WorkspaceEmailProvider.config. */
export type ProviderPublicConfig =
  | { kind: "BREVO" }
  | { kind: "MAILTRAP"; sandbox: boolean; inboxId: number | null }
  | { kind: "SMTP"; host: string; port: number; secure: boolean; username: string }

/** Fully resolved (decrypted) provider handed to the transport — server memory only. */
export type ResolvedProvider =
  | { kind: "brevo"; apiKey: string }
  | { kind: "mailtrap"; apiKey: string; sandbox: boolean; inboxId?: number }
  | { kind: "smtp"; host: string; port: number; secure: boolean; username?: string; password?: string }

export function publicConfigFrom(v: z.output<typeof providerFormSchema>): ProviderPublicConfig {
  if (v.provider === "BREVO") return { kind: "BREVO" }
  if (v.provider === "MAILTRAP") return { kind: "MAILTRAP", sandbox: v.sandbox, inboxId: v.inboxId ? Number(v.inboxId) : null }
  return { kind: "SMTP", host: v.host, port: v.port, secure: v.secure || v.port === 465, username: v.username }
}

export function parsePublicConfig(kind: WorkspaceProviderKind, raw: unknown): ProviderPublicConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  if (kind === "BREVO") return { kind }
  if (kind === "MAILTRAP") {
    const id = Number(r.inboxId)
    return { kind, sandbox: r.sandbox === true, inboxId: Number.isInteger(id) && id > 0 ? id : null }
  }
  const port = Number(r.port)
  return {
    kind,
    host: typeof r.host === "string" ? r.host : "",
    port: (SMTP_PORTS as readonly number[]).includes(port) ? port : 587,
    secure: r.secure === true,
    username: typeof r.username === "string" ? r.username : "",
  }
}

/** Combines public config with the decrypted secret. */
export function resolveProvider(config: ProviderPublicConfig, secret: string): ResolvedProvider {
  if (config.kind === "BREVO") return { kind: "brevo", apiKey: secret }
  if (config.kind === "MAILTRAP") return { kind: "mailtrap", apiKey: secret, sandbox: config.sandbox, ...(config.inboxId ? { inboxId: config.inboxId } : {}) }
  return { kind: "smtp", host: config.host, port: config.port, secure: config.secure, username: config.username || undefined, password: secret || undefined }
}

/** The secret that matters for a provider type (SMTP may legitimately have none). */
export function secretRequired(kind: WorkspaceProviderKind) {
  return kind !== "SMTP"
}
