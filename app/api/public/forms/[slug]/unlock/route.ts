import bcrypt from "bcryptjs"
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { normalizeSettings } from "@/lib/form-engine"
import { prisma } from "@/lib/prisma"
import { buildPublicPayload, clientIp, rateLimit, signUnlockToken } from "@/lib/public-form"

export const runtime = "nodejs"

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!(await rateLimit(`unlock:${clientIp(req.headers)}:${slug}`, 10, 60_000)))
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again in a minute." }, { status: 429 })

  const parsed = z.object({ password: z.string().min(1).max(200) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Enter the password." }, { status: 400 })

  const form = await prisma.form.findUnique({ where: { slug } })
  if (!form || form.status !== "PUBLISHED") return NextResponse.json({ ok: false, error: "Form not found." }, { status: 404 })
  const settings = normalizeSettings(form.settings)
  if (!settings.passwordEnabled || !settings.passwordHash)
    return NextResponse.json({ ok: true, token: null, payload: await buildPublicPayload(form) })

  const valid = await bcrypt.compare(parsed.data.password, settings.passwordHash)
  if (!valid) return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 })

  return NextResponse.json({
    ok: true,
    token: signUnlockToken(form.id, settings.passwordHash),
    payload: await buildPublicPayload(form),
  })
}
