import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

/**
 * Authenticated encryption for third-party credentials (workspace email
 * provider API keys / SMTP passwords).
 *
 *   AES-256-GCM, 96-bit random IV, 128-bit tag
 *   key  = HKDF-SHA256(EMAIL_CREDENTIALS_KEY || AUTH_SECRET, salt, "email-credentials:v1")
 *   AAD  = caller context (the workspace id) — a ciphertext copied to another
 *          workspace's row fails authentication instead of decrypting.
 *   wire = "v1.<iv>.<tag>.<ciphertext>" (base64url)
 *
 * Set EMAIL_CREDENTIALS_KEY in production so rotating AUTH_SECRET (sessions)
 * doesn't make stored credentials unreadable.
 */

const VERSION = "v1"
const SALT = "digital-fueled/secrets"

type Env = Record<string, string | undefined>

export class SecretError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SecretError"
  }
}

function deriveKey(env: Env): Buffer {
  const material = env.EMAIL_CREDENTIALS_KEY || env.AUTH_SECRET
  if (!material || material.length < 16) throw new SecretError("Set EMAIL_CREDENTIALS_KEY (or AUTH_SECRET) to at least 16 characters to store provider credentials.")
  return Buffer.from(hkdfSync("sha256", material, SALT, `email-credentials:${VERSION}`, 32))
}

export function encryptSecret(plaintext: string, context: string, env: Env = process.env): string {
  if (!context) throw new SecretError("An encryption context is required.")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", deriveKey(env), iv)
  cipher.setAAD(Buffer.from(context, "utf8"))
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".")
}

export function decryptSecret(token: string, context: string, env: Env = process.env): string {
  const parts = typeof token === "string" ? token.split(".") : []
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SecretError("Stored credentials are in an unknown format.")
  const [, ivB, tagB, ctB] = parts
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(env), Buffer.from(ivB, "base64url"))
    decipher.setAAD(Buffer.from(context, "utf8"))
    decipher.setAuthTag(Buffer.from(tagB, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]).toString("utf8")
  } catch (e) {
    if (e instanceof SecretError) throw e
    throw new SecretError("Stored credentials could not be decrypted. Re-enter them in Settings → Email delivery.")
  }
}

/** Last four characters for display ("••••a1b2"); short secrets reveal nothing. */
export function secretHint(secret: string): string | null {
  const s = secret.trim()
  return s.length >= 12 ? s.slice(-4) : null
}
