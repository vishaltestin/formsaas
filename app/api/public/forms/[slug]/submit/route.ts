import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { prisma } from "@/lib/prisma"
import { clientIp, rateLimit } from "@/lib/public-form"
import { runAfter, sha256 } from "@/lib/signing"
import { ingestSubmission, runPostSubmit } from "@/lib/submissions/ingest"

export const runtime = "nodejs"

const bodySchema = z.object({
  values: z.record(z.string(), z.any()),
  sessionId: z.string().max(80).optional().default(""),
  source: z.enum(["DIRECT", "IFRAME", "SCRIPT", "POPUP", "DRAWER"]).optional().default("DIRECT"),
  startedAt: z.number().nullable().optional(),
  meta: z
    .object({
      utm: z.record(z.string(), z.string().max(300)).optional(),
      referrer: z.string().max(2000).optional(),
      url: z.string().max(2000).optional(),
    })
    .optional(),
  hp: z.string().optional(),
  token: z.string().optional(),
  resumeToken: z.string().max(100).optional(),
})

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const ip = clientIp(req.headers)
  if (!(await rateLimit(`submit:${ip}:${slug}`, 20, 60_000)))
    return json({ ok: false, error: "Too many submissions. Please wait a minute and try again." }, 429)

  const length = Number(req.headers.get("content-length") ?? 0)
  if (length > 40 * 1024 * 1024) return json({ ok: false, error: "Payload too large." }, 413)

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400)
  }

  const form = await prisma.form.findUnique({ where: { slug } })
  if (!form || !form.publishedSchema) return json({ ok: false, error: "Form not found." }, 404)

  const result = await ingestSubmission({
    form,
    values: body.values,
    channel: "public",
    source: body.source,
    sessionId: body.sessionId,
    startedAt: body.startedAt,
    meta: { ...body.meta, referrer: body.meta?.referrer ?? req.headers.get("referer") ?? "" },
    ip,
    userAgent: req.headers.get("user-agent") ?? "",
    token: body.token,
    hp: body.hp,
    resumeTokenHash: body.resumeToken ? sha256(body.resumeToken) : undefined,
  })

  if (!result.ok) return json({ ok: false, error: result.error, code: result.code, errors: result.errors }, result.status)
  if (result.spam) return json({ ok: true, submissionId: null, completion: result.completion })

  const context = result.context
  await runAfter(() => runPostSubmit(context))
  return json({ ok: true, submissionId: result.submission.id, completion: result.completion, receiptUrl: result.receiptUrl })
}
