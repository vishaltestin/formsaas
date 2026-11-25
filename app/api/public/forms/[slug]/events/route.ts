import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { prisma } from "@/lib/prisma"
import { clientIp, rateLimit } from "@/lib/public-form"

export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

const schema = z.object({
  type: z.enum(["VIEW", "START", "STEP_COMPLETE"]),
  stepIndex: z.number().int().min(0).max(500).optional(),
  sessionId: z.string().min(3).max(80),
  source: z.enum(["DIRECT", "IFRAME", "SCRIPT", "POPUP", "DRAWER"]).default("DIRECT"),
})

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!(await rateLimit(`events:${clientIp(req.headers)}`, 120, 60_000)))
    return NextResponse.json({ ok: false }, { status: 429, headers: CORS })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400, headers: CORS })
  const { type, stepIndex, sessionId, source } = parsed.data

  const form = await prisma.form.findUnique({ where: { slug }, select: { id: true, status: true } })
  if (!form || form.status !== "PUBLISHED") return NextResponse.json({ ok: false }, { status: 404, headers: CORS })

  // De-duplicate per session so refreshes don't inflate the funnel.
  const exists = await prisma.formEvent.findFirst({
    where: {
      formId: form.id,
      sessionId,
      type,
      ...(type === "STEP_COMPLETE" ? { stepIndex: stepIndex ?? 0 } : {}),
    },
    select: { id: true },
  })
  if (!exists) {
    await prisma.formEvent.create({
      data: {
        formId: form.id,
        sessionId,
        type,
        source,
        stepIndex: type === "VIEW" ? null : (stepIndex ?? 0),
      },
    })
  }
  return NextResponse.json({ ok: true }, { headers: CORS })
}
