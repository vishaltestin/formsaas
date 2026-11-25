import { NextResponse, type NextRequest } from "next/server"

import { formatValue, isInputField, normalizeSchema, type FieldValue, type FormField } from "@/lib/form-engine"
import { csvCell } from "@/lib/csv"
import { prisma } from "@/lib/prisma"
import { levelAllows } from "@/lib/rbac/policy"
import { resolveFormAccess } from "@/lib/rbac/server"
import { getSessionUser } from "@/lib/session"

export const runtime = "nodejs"

export async function GET(req: NextRequest, ctx: { params: Promise<{ formId: string }> }) {
  const { formId } = await ctx.params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const access = await resolveFormAccess(user.id, formId)
  if (!access || !levelAllows(access.level, "submissions.export"))
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  const form = access.form

  const sp = req.nextUrl.searchParams
  const format = sp.get("format") === "json" ? "json" : "csv"
  const ids = sp.get("ids")?.split(",").filter(Boolean)
  const status = sp.get("status")
  const from = sp.get("from")
  const to = sp.get("to")
  const q = sp.get("q")?.trim().toLowerCase()

  const createdAt: { gte?: Date; lte?: Date } = {}
  if (from && !Number.isNaN(Date.parse(from))) createdAt.gte = new Date(from)
  if (to && !Number.isNaN(Date.parse(to))) createdAt.lte = new Date(to)

  let rows = await prisma.submission.findMany({
    where: {
      formId,
      ...(ids?.length ? { id: { in: ids.slice(0, 5000) } } : {}),
      ...(status && ["NEW", "REVIEWED", "FLAGGED", "ARCHIVED"].includes(status)
        ? { status: status as "NEW" | "REVIEWED" | "FLAGGED" | "ARCHIVED" }
        : {}),
      ...(createdAt.gte || createdAt.lte ? { createdAt } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
  })
  if (q) rows = rows.filter((r) => JSON.stringify(r.data).toLowerCase().includes(q) || (r.notes ?? "").toLowerCase().includes(q))

  const schema = normalizeSchema(form.publishedSchema ?? form.draftSchema)
  const fields = schema.fields.filter(isInputField)
  const known = new Set(fields.map((f) => f.key))
  // Include keys from older versions that no longer exist in the schema.
  const extraKeys = Array.from(
    new Set(rows.flatMap((r) => Object.keys((r.data ?? {}) as Record<string, unknown>)).filter((k) => !known.has(k)))
  )
  const stamp = new Date().toISOString().slice(0, 10)
  const base = `${form.slug}-responses-${stamp}`

  if (format === "json") {
    const body = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
      score: r.computedScore,
      notes: r.notes,
      data: r.data,
      metadata: r.metadata,
    }))
    return new NextResponse(JSON.stringify({ form: { id: form.id, title: form.title, slug: form.slug }, count: body.length, submissions: body }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.json"`,
        "Cache-Control": "no-store",
      },
    })
  }

  const header = ["id", "submitted_at", "status", "score", ...fields.map((f) => f.key), ...extraKeys, "_internal_notes", "_device", "_referrer", "_utm_source", "_utm_medium", "_utm_campaign", "_channel", "_completion_seconds"]
  const lines = [header.map(csvCell).join(",")]
  for (const r of rows) {
    const data = (r.data ?? {}) as Record<string, FieldValue>
    const meta = (r.metadata ?? {}) as Record<string, unknown>
    const utm = (meta.utm ?? {}) as Record<string, string>
    const cells = [
      r.id,
      r.createdAt.toISOString(),
      r.status,
      r.computedScore ?? "",
      ...fields.map((f: FormField) => (f.type === "file" || f.type === "signature" ? (data[f.key] ? "[attached]" : "") : formatValue(f, data[f.key]))),
      ...extraKeys.map((k) => {
        const v = data[k]
        return typeof v === "object" && v !== null ? JSON.stringify(v) : (v ?? "")
      }),
      r.notes ?? "",
      meta.device ?? "",
      meta.referrer ?? "",
      utm.utm_source ?? "",
      utm.utm_medium ?? "",
      utm.utm_campaign ?? "",
      meta.embedType ?? "",
      meta.completionSeconds ?? "",
    ]
    lines.push(cells.map(csvCell).join(","))
  }
  return new NextResponse("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
