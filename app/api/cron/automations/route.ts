import { NextResponse, type NextRequest } from "next/server"

import { pruneIdempotency } from "@/lib/api/idempotency"
import { processDueRuns } from "@/lib/automations/runner"
import { pruneRateLimitBuckets } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Resumes due delayed automation runs and prunes expired rate-limit buckets
 * and idempotency records.
 * Call from an external scheduler with `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 403 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  const resumed = await processDueRuns(100)
  const [pruned, idem] = await Promise.all([pruneRateLimitBuckets(), pruneIdempotency()])
  return NextResponse.json({ ok: true, resumed, prunedBuckets: pruned.count, prunedIdempotency: idem.count })
}

export const GET = POST
