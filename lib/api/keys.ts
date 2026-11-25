import { createHash, randomBytes } from "node:crypto"

export const API_SCOPES = ["forms:read", "forms:write", "submissions:read", "submissions:write", "automations:trigger", "analytics:read"] as const
export type ApiScope = (typeof API_SCOPES)[number]

export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  "forms:read": "List and read forms, fields and automations",
  "forms:write": "Create, update, publish and delete forms",
  "submissions:read": "List and read submissions",
  "submissions:write": "Create, update and delete submissions",
  "automations:trigger": "Trigger manual automations",
  "analytics:read": "Read form analytics",
}

export const KEY_PREFIX = "fs_live_"

export function hashApiKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex")
}

/** Generates a new key. Only `prefix` and `hash` are persisted; `raw` is shown once. */
export function keyPrefix(raw: string) {
  return raw.slice(0, KEY_PREFIX.length + 6)
}

export function generateApiKey() {
  const raw = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`
  return { raw, prefix: keyPrefix(raw), hash: hashApiKey(raw) }
}

export function parseScopes(raw: unknown): ApiScope[] {
  return Array.isArray(raw) ? raw.filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s as string)) : []
}

export function parseBearer(header: string | null): string | null {
  if (!header) return null
  const m = header.match(/^Bearer\s+(\S+)$/i)
  return m ? m[1] : null
}
