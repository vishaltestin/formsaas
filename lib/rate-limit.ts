import "server-only"

import { createHash } from "node:crypto"

import { prisma } from "@/lib/prisma"

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  /** Unix seconds when the current window resets */
  reset: number
}

const fallback = new Map<string, { count: number; windowStart: number }>()

function bucketKey(key: string) {
  // Keys can contain IPs, slugs and ids; hash long keys to fit the VARCHAR(191) PK.
  return key.length > 180 ? `h:${createHash("sha256").update(key).digest("hex")}` : key
}

/**
 * Fixed-window rate limiter persisted in `RateLimitBucket`, so limits hold
 * across server instances and restarts. One atomic upsert per hit:
 * the counter resets when a new window starts and increments otherwise.
 */
export async function hitRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStartMs = Math.floor(now / windowMs) * windowMs
  const windowStart = new Date(windowStartMs)
  const reset = Math.ceil((windowStartMs + windowMs) / 1000)
  const k = bucketKey(key)
  try {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO RateLimitBucket (\`key\`, windowStart, count, updatedAt)
        VALUES (${k}, ${windowStart}, 1, NOW(3))
        ON DUPLICATE KEY UPDATE
          count = IF(windowStart = VALUES(windowStart), count + 1, 1),
          windowStart = VALUES(windowStart),
          updatedAt = NOW(3)`
      return tx.$queryRaw<{ count: number | bigint }[]>`SELECT count FROM RateLimitBucket WHERE \`key\` = ${k}`
    })
    const count = Number(rows[0]?.count ?? 1)
    return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count), reset }
  } catch (e) {
    // Degrade to a per-process limiter rather than failing open entirely.
    console.error("[rate-limit] DB bucket failed, using in-memory fallback", e instanceof Error ? e.message : e)
    const b = fallback.get(k)
    if (!b || b.windowStart !== windowStartMs) fallback.set(k, { count: 1, windowStart: windowStartMs })
    else b.count++
    const count = fallback.get(k)!.count
    return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count), reset }
  }
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(r.reset),
    ...(r.allowed ? {} : { "Retry-After": String(Math.max(1, r.reset - Math.floor(Date.now() / 1000))) }),
  }
}

/** Housekeeping: drop buckets whose window ended long ago. */
export async function pruneRateLimitBuckets(olderThanMs = 24 * 3600_000) {
  return prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - olderThanMs) } } })
}
