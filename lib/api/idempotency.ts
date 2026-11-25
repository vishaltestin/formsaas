import "server-only"

import { createHash } from "node:crypto"

import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

import { ApiError } from "./handler"

const TTL_MS = 24 * 3600_000

export type IdempotencyOutcome = { replay: { status: number; body: unknown } } | { recordId: string } | null

/**
 * Stripe-style idempotency: the first request with a key reserves it; retries
 * with the same key and identical body replay the stored response; a different
 * body with the same key is rejected; concurrent duplicates get 409.
 */
export async function beginIdempotent(apiKeyId: string, key: string | null, fingerprint: string): Promise<IdempotencyOutcome> {
  if (!key) return null
  if (key.length > 191 || !/^[\x21-\x7e]+$/.test(key)) throw new ApiError(400, "invalid_idempotency_key", "Idempotency-Key must be 1–191 printable ASCII characters.")
  const requestHash = createHash("sha256").update(fingerprint).digest("hex")
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rec = await prisma.idempotencyRecord.create({ data: { apiKeyId, key, requestHash, status: 0, response: {} } })
      return { recordId: rec.id }
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e
      const existing = await prisma.idempotencyRecord.findUnique({ where: { apiKeyId_key: { apiKeyId, key } } })
      if (!existing) continue
      if (Date.now() - existing.createdAt.getTime() > TTL_MS) {
        await prisma.idempotencyRecord.delete({ where: { id: existing.id } }).catch(() => undefined)
        continue
      }
      if (existing.requestHash !== requestHash)
        throw new ApiError(422, "idempotency_key_reused", "This Idempotency-Key was already used with a different request body.")
      if (existing.status === 0) throw new ApiError(409, "idempotency_in_progress", "A request with this Idempotency-Key is still being processed.")
      return { replay: { status: existing.status, body: existing.response } }
    }
  }
  throw new ApiError(409, "idempotency_conflict", "Could not reserve the Idempotency-Key. Retry the request.")
}

export async function completeIdempotent(recordId: string | null, status: number, body: unknown) {
  if (!recordId) return
  if (status >= 500) {
    await prisma.idempotencyRecord.delete({ where: { id: recordId } }).catch(() => undefined)
    return
  }
  await prisma.idempotencyRecord.update({ where: { id: recordId }, data: { status, response: JSON.parse(JSON.stringify(body)) } })
}

export async function pruneIdempotency() {
  return prisma.idempotencyRecord.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - TTL_MS) } } })
}
