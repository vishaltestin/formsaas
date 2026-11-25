/**
 * Only same-origin, path-absolute redirects are allowed after sign-in.
 * Rejects protocol-relative ("//evil.com"), backslash ("/\\evil.com") and
 * scheme URLs, which browsers would otherwise treat as off-site.
 */
export function safeCallbackUrl(raw: string | null | undefined, fallback = "/dashboard") {
  if (!raw || typeof raw !== "string" || raw.length > 2000) return fallback
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback
  if (/[\u0000-\u001f]/.test(raw)) return fallback
  return raw
}
