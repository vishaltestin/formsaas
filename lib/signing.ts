import "server-only"

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

function secret() {
  return process.env.AUTH_SECRET || "formstudio-dev-secret"
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex")
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url")
}

/** Short HMAC signature binding a purpose to a subject (e.g. receipt:<submissionId>). */
export function signValue(purpose: string, subject: string) {
  return createHmac("sha256", secret()).update(`${purpose}:${subject}`).digest("base64url").slice(0, 32)
}

export function verifyValue(purpose: string, subject: string, signature: string | null | undefined) {
  if (!signature) return false
  const expected = Buffer.from(signValue(purpose, subject))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** Safe wrapper around next/server `after()` that also works outside a request scope (tests, scripts). */
export async function runAfter(fn: () => Promise<unknown>) {
  try {
    const { after } = await import("next/server")
    after(async () => {
      try {
        await fn()
      } catch (e) {
        console.error("[after] task failed", e)
      }
    })
  } catch {
    await fn().catch((e) => console.error("[after] task failed", e))
  }
}
