import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { ApprovalError, decideApproval, verifyApprovalSignature } from "@/lib/automations/runner"
import { prisma } from "@/lib/prisma"
import { clientIp, rateLimit } from "@/lib/public-form"

export const runtime = "nodejs"

const bodySchema = z.object({
  node: z.string().min(1).max(64),
  sig: z.string().min(10).max(100),
  decision: z.enum(["approved", "rejected"]),
  reviewer: z.string().trim().max(200).optional(),
  comment: z.string().max(2000).optional(),
})

/** Reviewer decision from the signed approval link (no account required). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params
  if (!(await rateLimit(`approval:${clientIp(req.headers)}`, 20, 60_000))) return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 })
  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 })
  }
  if (!verifyApprovalSignature(runId, body.node, body.sig)) return NextResponse.json({ ok: false, error: "This approval link is invalid." }, { status: 403 })
  const run = await prisma.automationRun.findUnique({ where: { id: runId }, select: { waitingNodeId: true } })
  if (!run || run.waitingNodeId !== body.node) return NextResponse.json({ ok: false, error: "This approval request is no longer pending." }, { status: 409 })
  try {
    const updated = await decideApproval(runId, body.decision, body.reviewer || "reviewer (email link)", body.comment)
    return NextResponse.json({ ok: true, status: updated.status })
  } catch (e) {
    if (e instanceof ApprovalError) return NextResponse.json({ ok: false, error: e.message }, { status: 409 })
    throw e
  }
}
