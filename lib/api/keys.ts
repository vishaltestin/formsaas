import { createHash, randomBytes } from "node:crypto"

import { API_SCOPES, SCOPE_DESCRIPTIONS, type ApiScope } from "@/lib/api/scopes"

export { API_SCOPES, SCOPE_DESCRIPTIONS, type ApiScope }

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
  return Array.isArray(raw)
    ? raw.filter((s): s is ApiScope =>
        (API_SCOPES as readonly string[]).includes(s as string)
      )
    : []
}

export function parseBearer(header: string | null): string | null {
  if (!header) return null
  const m = header.match(/^Bearer\s+(\S+)$/i)
  return m ? m[1] : null
}
