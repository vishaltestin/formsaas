import { z, ZodError } from "zod"

import { ApiError, apiRoute, json, ownedForm, pageParams } from "@/lib/api/handler"
import { beginIdempotent, completeIdempotent } from "@/lib/api/idempotency"
import { submissionToApi } from "@/lib/api/serializers"
import { isInputField, normalizeSchema } from "@/lib/form-engine"
import { toCsv } from "@/lib/csv"
import { prisma } from "@/lib/prisma"
import { runAfter } from "@/lib/signing"
import { ingestSubmission, runPostSubmit } from "@/lib/submissions/ingest"

export const runtime = "nodejs"

type P = { formId: string }

export const GET = apiRoute<P>("submissions:read", async (ctx, { formId }) => {
  const form = await ownedForm(ctx, formId)
  const { limit, cursor } = pageParams(ctx.req)
  const sp = ctx.req.nextUrl.searchParams
  const status = sp.get("status")
  const since = sp.get("since") ? new Date(sp.get("since")!) : null
  if (since && Number.isNaN(since.getTime())) throw new ApiError(400, "invalid_request", "`since` must be an ISO 8601 date.")
  const rows = await prisma.submission.findMany({
    where: {
      formId: form.id,
      ...(status && ["NEW", "REVIEWED", "FLAGGED", "ARCHIVED"].includes(status) ? { status: status as "NEW" } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  const page = rows.slice(0, limit)
  if (sp.get("format") === "csv") {
    const schema = normalizeSchema(form.publishedSchema ?? form.draftSchema)
    const keys = schema.fields.filter(isInputField).map((f) => f.key)
    const csv = toCsv([
      ["id", "createdAt", "status", "score", ...keys],
      ...page.map((s) => {
        const d = (s.data ?? {}) as Record<string, unknown>
        return [s.id, s.createdAt.toISOString(), s.status, s.computedScore, ...keys.map((k) => d[k])]
      }),
    ])
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", ...(rows.length > limit ? { "X-Next-Cursor": page[page.length - 1].id } : {}) } })
  }
  return json({ object: "list", data: page.map(submissionToApi), hasMore: rows.length > limit, nextCursor: rows.length > limit ? page[page.length - 1].id : null })
})

const createSchema = z
  .object({
    data: z.record(z.string(), z.unknown()),
    meta: z.object({ referrer: z.string().max(2000).optional(), url: z.string().max(2000).optional(), utm: z.record(z.string(), z.string().max(300)).optional() }).optional(),
  })
  .strict()

/**
 * Creates a submission through the exact same pipeline as the hosted form:
 * published-schema Zod validation, conditional logic, calculated fields,
 * caps/schedule, plan quotas — then fires webhooks and automations.
 * Supports `Idempotency-Key` for safe retries.
 */
export const POST = apiRoute<P>("submissions:write", async (ctx, { formId }) => {
  const form = await ownedForm(ctx, formId)
  const raw = await ctx.req.text()
  const idem = await beginIdempotent(ctx.key.id, ctx.req.headers.get("idempotency-key"), `POST ${ctx.req.nextUrl.pathname}\n${raw}`)
  if (idem && "replay" in idem) return json(idem.replay.body, idem.replay.status, { "Idempotent-Replayed": "true" })
  const recordId = idem && "recordId" in idem ? idem.recordId : null
  try {
    const body = createSchema.parse(raw.trim() ? JSON.parse(raw) : {})
    if (!form.publishedSchema) throw new ApiError(409, "not_published", "This form has not been published.")
    const schema = normalizeSchema(form.publishedSchema)
    const byKey = new Map(schema.fields.filter(isInputField).map((f) => [f.key, f]))
    const unknown = Object.keys(body.data).filter((k) => !byKey.has(k))
    if (unknown.length) throw new ApiError(400, "unknown_fields", `Unknown field key(s): ${unknown.join(", ")}`, { unknown, allowed: Array.from(byKey.keys()) })
    const values: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body.data)) values[byKey.get(k)!.id] = v

    const result = await ingestSubmission({ form, values, channel: "api", meta: body.meta, ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent") ?? "api" })
    let status: number
    let payload: unknown
    if (!result.ok) {
      const keyed = result.errors
        ? Object.fromEntries(Object.entries(result.errors).map(([id, msg]) => [schema.fields.find((f) => f.id === id)?.key ?? id, msg]))
        : undefined
      status = result.status
      payload = { error: { code: result.code, message: result.error, ...(keyed ? { details: keyed } : {}) } }
    } else if (result.spam) {
      status = 422
      payload = { error: { code: "rejected", message: "Submission rejected." } }
    } else {
      status = 201
      payload = { data: { ...submissionToApi(result.submission), receiptUrl: result.receiptUrl } }
      const context = result.context
      await runAfter(() => runPostSubmit(context))
    }
    await completeIdempotent(recordId, status, payload)
    return json(payload, status)
  } catch (e) {
    let status: number | null = null
    let payload: unknown = null
    if (e instanceof ApiError) {
      status = e.status
      payload = { error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) } }
    } else if (e instanceof ZodError) {
      status = 400
      payload = { error: { code: "invalid_request", message: "The request body is invalid.", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }
    } else if (e instanceof SyntaxError) {
      status = 400
      payload = { error: { code: "invalid_json", message: "Request body must be valid JSON." } }
    }
    if (status !== null) {
      await completeIdempotent(recordId, status, payload)
      return json(payload, status)
    }
    await completeIdempotent(recordId, 500, null)
    throw e
  }
})
