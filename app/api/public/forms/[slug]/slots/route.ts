import { NextResponse, type NextRequest } from "next/server"

import { normalizeSchema } from "@/lib/form-engine"
import { prisma } from "@/lib/prisma"
import { clientIp, rateLimit } from "@/lib/public-form"
import { takenSlots } from "@/lib/submissions/ingest"

export const runtime = "nodejs"

/**
 * Booked slots for an appointment field with exclusive slots.
 * GET /api/public/forms/:slug/slots?field=<fieldId>&date=YYYY-MM-DD → { taken: ["09:30", …] }
 * Returns only times, never submission data.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!(await rateLimit(`slots:${clientIp(req.headers)}:${slug}`, 120, 60_000)))
    return NextResponse.json({ taken: [], error: "Too many requests." }, { status: 429 })
  const fieldId = req.nextUrl.searchParams.get("field") ?? ""
  const date = req.nextUrl.searchParams.get("date") ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ taken: [], error: "Invalid date." }, { status: 400 })

  const form = await prisma.form.findUnique({ where: { slug }, select: { id: true, status: true, publishedSchema: true } })
  if (!form || form.status !== "PUBLISHED" || !form.publishedSchema) return NextResponse.json({ taken: [] }, { status: 404 })
  const field = normalizeSchema(form.publishedSchema).fields.find((f) => f.id === fieldId && f.type === "appointment")
  if (!field) return NextResponse.json({ taken: [] }, { status: 404 })
  if (!field.props?.exclusiveSlots) return NextResponse.json({ taken: [] })

  return NextResponse.json({ taken: await takenSlots(form.id, field.key, date) }, { headers: { "Cache-Control": "no-store" } })
}
