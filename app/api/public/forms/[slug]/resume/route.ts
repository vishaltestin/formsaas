import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { isInputField, normalizeSchema, normalizeSettings } from "@/lib/form-engine"
import { escapeHtml, sendEmail } from "@/lib/notify"
import { prisma } from "@/lib/prisma"
import { appUrl } from "@/lib/format"
import { clientIp, rateLimit } from "@/lib/public-form"
import { randomToken, sha256 } from "@/lib/signing"

export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: CORS })

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

const saveSchema = z.object({
  values: z.record(z.string(), z.any()),
  stepIndex: z.number().int().min(0).max(500).default(0),
  email: z.string().trim().email().optional().or(z.literal("")),
  token: z.string().max(100).optional(),
})

async function loadForm(slug: string) {
  const form = await prisma.form.findUnique({ where: { slug } })
  if (!form || !form.publishedSchema || form.status !== "PUBLISHED") return null
  const settings = normalizeSettings(form.settings)
  if (!settings.saveAndResume) return null
  return { form, settings, schema: normalizeSchema(form.publishedSchema) }
}

/** Save progress. Re-using an existing token updates the same draft. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!(await rateLimit(`resume:${clientIp(req.headers)}:${slug}`, 30, 60_000))) return json({ ok: false, error: "Too many requests." }, 429)
  if (Number(req.headers.get("content-length") ?? 0) > 8 * 1024 * 1024) return json({ ok: false, error: "Progress is too large to save." }, 413)
  const loaded = await loadForm(slug)
  if (!loaded) return json({ ok: false, error: "Save & resume isn't available for this form." }, 404)
  let body: z.infer<typeof saveSchema>
  try {
    body = saveSchema.parse(await req.json())
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400)
  }
  // Never persist secrets or computed values in drafts.
  const allowed = new Set(loaded.schema.fields.filter((f) => isInputField(f) && f.type !== "password" && f.type !== "calculated").map((f) => f.id))
  const data = Object.fromEntries(Object.entries(body.values).filter(([k]) => allowed.has(k)))
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(90, loaded.settings.resumeTtlDays)) * 86400000)

  let token = body.token && body.token.length >= 20 ? body.token : null
  if (token) {
    const updated = await prisma.resumeDraft.updateMany({
      where: { tokenHash: sha256(token), formId: loaded.form.id },
      data: { data, stepIndex: body.stepIndex, expiresAt, ...(body.email ? { email: body.email } : {}) },
    })
    if (updated.count === 0) token = null
  }
  if (!token) {
    token = randomToken(24)
    await prisma.resumeDraft.create({
      data: { formId: loaded.form.id, tokenHash: sha256(token), data, stepIndex: body.stepIndex, email: body.email || null, expiresAt },
    })
  }
  const url = `${appUrl()}/f/${slug}?resume=${token}`
  if (body.email) {
    await sendEmail({
      to: [body.email],
      subject: `Continue “${loaded.form.title}”`,
      html: `<p>Your progress on <strong>${escapeHtml(loaded.form.title)}</strong> is saved.</p><p><a href="${url}">Continue where you left off</a></p><p style="color:#666">This private link expires on ${expiresAt.toDateString()}.</p>`,
      source: `resume:${loaded.form.id}`,
      workspaceId: loaded.form.workspaceId,
    })
  }
  return json({ ok: true, token, url, expiresAt: expiresAt.toISOString() })
}

/** Load a saved draft by token. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const token = req.nextUrl.searchParams.get("token") ?? ""
  if (token.length < 20) return json({ ok: false, error: "Invalid link." }, 400)
  const loaded = await loadForm(slug)
  if (!loaded) return json({ ok: false, error: "Save & resume isn't available for this form." }, 404)
  const draft = await prisma.resumeDraft.findUnique({ where: { tokenHash: sha256(token) } })
  if (!draft || draft.formId !== loaded.form.id) return json({ ok: false, error: "This resume link is invalid or was already used." }, 404)
  if (draft.expiresAt < new Date()) {
    await prisma.resumeDraft.delete({ where: { id: draft.id } }).catch(() => undefined)
    return json({ ok: false, error: "This resume link has expired." }, 410)
  }
  return json({ ok: true, values: draft.data, stepIndex: draft.stepIndex, savedAt: draft.updatedAt.toISOString() })
}
