import "server-only"

import type { Form, Submission } from "@/generated/prisma/client"
import { dispatchAutomationTrigger } from "@/lib/automations/runner"
import { assertEntitlement, EntitlementError, getEffectivePlan } from "@/lib/entitlements"
import {
  availability,
  computeScore,
  evaluateLogic,
  hasScoring,
  isInputField,
  normalizeMode,
  normalizeSchema,
  normalizeSettings,
  resolveCompletion,
  toKeyedData,
  toPublicSettings,
  validateValues,
  type CompletionResult,
  type FieldValue,
  type FormSchema,
  type FormSettings,
  type FormValues,
} from "@/lib/form-engine"
import { answerRows, buildNewResponseEmail, buildThankYouEmail } from "@/lib/email/auto-reply"
import { sendEmail } from "@/lib/notify"
import { prisma } from "@/lib/prisma"
import { hashIp, parseUserAgent, verifyUnlockToken } from "@/lib/public-form"
import { signValue } from "@/lib/signing"
import { dispatchFormWebhooks } from "@/lib/webhooks"

export type IngestChannel = "public" | "api"
export type IngestSource = "DIRECT" | "IFRAME" | "SCRIPT" | "POPUP" | "DRAWER"

export interface IngestInput {
  form: Form
  /** Values keyed by field id (public renderer) — use `fromKeyedData` for key-keyed API input. */
  values: Record<string, unknown>
  channel: IngestChannel
  source?: IngestSource
  sessionId?: string
  startedAt?: number | null
  meta?: { utm?: Record<string, string>; referrer?: string; url?: string }
  ip?: string
  userAgent?: string
  /** Password unlock token (public channel). */
  token?: string
  /** Honeypot value (public channel). */
  hp?: string
  /** Resume draft to delete after a successful submission. */
  resumeTokenHash?: string
}

export type IngestResult =
  | {
      ok: true
      spam?: false
      submission: Submission
      completion: CompletionResult
      receiptUrl: string | null
      data: Record<string, FieldValue>
      context: PostSubmitContext
    }
  | { ok: true; spam: true; completion: CompletionResult }
  | { ok: false; status: number; error: string; code: string; errors?: Record<string, string> }

export interface PostSubmitContext {
  form: Form
  schema: FormSchema
  settings: FormSettings
  submission: Submission
  clean: FormValues
  data: Record<string, FieldValue>
  visibleFieldIds: Set<string>
  completion: CompletionResult
  webhooksAllowed: boolean
}

const fail = (status: number, code: string, error: string, errors?: Record<string, string>): IngestResult => ({ ok: false, status, code, error, errors })

export function receiptPath(slug: string, submissionId: string) {
  return `/f/${slug}/receipt/${submissionId}?sig=${signValue("receipt", submissionId)}`
}

/**
 * The single submission pipeline shared by the public renderer endpoint and
 * the REST API. It enforces availability (status, schedule, cap), password,
 * domain allow-listing and anti-spam (public only), plan quotas, the shared
 * dynamic Zod validator with conditional logic, server-side recomputation of
 * calculated fields, and atomically inserts the submission while holding a
 * row lock on the form so `maxSubmissions` can never be exceeded under load.
 */
export async function ingestSubmission(input: IngestInput): Promise<IngestResult> {
  const { form } = input
  if (!form.publishedSchema) return fail(404, "not_published", "Form not found.")
  const settings = normalizeSettings(form.settings)
  const isPublic = input.channel === "public"
  const source: IngestSource = input.source ?? "DIRECT"

  const total = await prisma.submission.count({ where: { formId: form.id } })
  const avail = availability(form.status, settings, total)
  if (!avail.open) return fail(avail.reason === "draft" ? 404 : 403, `form_${avail.reason}`, avail.message)

  if (isPublic) {
    if (settings.passwordEnabled && settings.passwordHash && !verifyUnlockToken(input.token, form.id, settings.passwordHash))
      return fail(401, "password_required", "This form is password protected. Please unlock it again.")

    if (settings.allowedDomains.length > 0 && source !== "DIRECT") {
      let host = ""
      try {
        host = new URL(input.meta?.referrer ?? "").hostname.toLowerCase()
      } catch {
        host = ""
      }
      const allowed = host !== "" && settings.allowedDomains.some((d) => host === d || host.endsWith(`.${d}`))
      if (!allowed) return fail(403, "domain_not_allowed", "This form can't be submitted from this website.")
    }
  }

  // Validate & evaluate against the PUBLISHED schema only — drafts never leak into live validation.
  const schema = normalizeSchema(form.publishedSchema)
  const mode = normalizeMode(form.mode)
  const publicSettings = toPublicSettings(settings)

  if (isPublic && settings.honeypot && input.hp && input.hp.trim() !== "") {
    const logic = evaluateLogic(schema, {}, { mode })
    return { ok: true, spam: true, completion: resolveCompletion(schema, publicSettings, {}, logic, mode) }
  }
  if (isPublic && input.startedAt && settings.minSubmitSeconds > 0) {
    const elapsed = (Date.now() - input.startedAt) / 1000
    if (elapsed >= 0 && elapsed < settings.minSubmitSeconds)
      return fail(429, "too_fast", "That was fast! Please review your answers and submit again.")
  }

  try {
    await assertEntitlement(form.userId, "submission.create")
  } catch (e) {
    if (e instanceof EntitlementError) return fail(403, "quota_exceeded", "This form is temporarily not accepting responses.")
    throw e
  }
  const plan = await getEffectivePlan(form.userId)

  // Tamper protection: keys that don't exist in the published schema are rejected outright.
  // Calculated fields are always recomputed server-side, so client-sent values are ignored.
  const knownIds = new Set(schema.fields.map((f) => f.id))
  const unknown = Object.keys(input.values ?? {}).filter((k) => !knownIds.has(k))
  if (unknown.length > 0)
    return fail(400, "unknown_fields", `Unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.slice(0, 10).join(", ")}`, Object.fromEntries(unknown.slice(0, 20).map((k) => [k, "Unknown field"])))
  const inputIds = new Set(schema.fields.filter((f) => isInputField(f) && f.type !== "calculated").map((f) => f.id))
  const values: FormValues = {}
  for (const [k, v] of Object.entries(input.values ?? {})) if (inputIds.has(k)) values[k] = v as FieldValue

  const logic = evaluateLogic(schema, values, { mode, enabled: plan.features.conditionalLogic })
  const merged: FormValues = { ...values, ...logic.setValues }
  const result = validateValues(schema, merged, logic.visibleFieldIds, {
    requiredIds: logic.required,
    maxUploadMb: plan.limits.maxFileUploadMb < 0 ? 100 : plan.limits.maxFileUploadMb,
  })
  if (!result.success) return fail(422, "validation_failed", "Please fix the highlighted fields.", result.errors)

  const clean: FormValues = {}
  for (const f of schema.fields) {
    if (!logic.visibleFieldIds.has(f.id)) continue
    let v = merged[f.id]
    if (NUMERIC_TYPES.has(f.type) && v !== "" && v !== null && v !== undefined) v = Number(v)
    if (f.type === "country" && typeof v === "string") v = v.toUpperCase()
    clean[f.id] = v
  }

  const completion = resolveCompletion(schema, publicSettings, clean, logic, mode)
  const computedScore = mode === "QUIZ" || hasScoring(schema) ? computeScore(schema, clean, logic.visibleFieldIds) : null
  const ua = input.userAgent ?? ""
  const device = parseUserAgent(ua)
  const completionSeconds = input.startedAt ? Math.max(0, Math.round((Date.now() - input.startedAt) / 1000)) : null
  const data = toKeyedData(schema, clean)

  let submission: Submission
  try {
    submission = await prisma.$transaction(async (tx) => {
      // Serialise concurrent submissions per form so the cap check + insert is atomic.
      await tx.$queryRaw`SELECT id FROM Form WHERE id = ${form.id} FOR UPDATE`
      if (settings.maxSubmissions && settings.maxSubmissions > 0) {
        const count = await tx.submission.count({ where: { formId: form.id } })
        if (count >= settings.maxSubmissions) throw new CapReachedError()
      }
      // Exclusive appointment slots: the form row lock above makes check + insert atomic.
      for (const f of schema.fields) {
        if (f.type !== "appointment" || !f.props?.exclusiveSlots) continue
        const slot = data[f.key] as { date?: string; time?: string } | undefined
        if (!slot?.date || !slot.time) continue
        if (await slotTaken(tx, form.id, f.key, slot.date, slot.time)) throw new SlotTakenError(f.id)
      }
      const created = await tx.submission.create({
        data: {
          formId: form.id,
          data: data as object,
          computedScore,
          metadata: {
            ...device,
            userAgent: ua.slice(0, 300),
            referrer: input.meta?.referrer ?? "",
            url: input.meta?.url ?? "",
            utm: input.meta?.utm ?? {},
            completionSeconds,
            embedType: input.channel === "api" ? "API" : source,
            channel: input.channel,
            ipHash: input.ip ? hashIp(input.ip) : null,
            endingRuleId: logic.ending?.ruleId ?? null,
          },
        },
      })
      if (input.channel === "public")
        await tx.formEvent.create({ data: { formId: form.id, sessionId: input.sessionId || created.id, type: "SUBMIT", source } })
      if (input.resumeTokenHash) await tx.resumeDraft.deleteMany({ where: { tokenHash: input.resumeTokenHash, formId: form.id } })
      return created
    })
  } catch (e) {
    if (e instanceof CapReachedError) return fail(403, "form_cap", "This form has reached its maximum number of responses.")
    if (e instanceof SlotTakenError)
      return fail(409, "slot_taken", "That time slot was just booked. Please pick another one.", { [e.fieldId]: "That slot was just booked. Please pick another time." })
    throw e
  }

  return {
    ok: true,
    submission,
    completion,
    data,
    receiptUrl: settings.showReceipt ? receiptPath(form.slug, submission.id) : null,
    context: {
      form,
      schema,
      settings,
      submission,
      clean,
      data,
      visibleFieldIds: logic.visibleFieldIds,
      completion,
      webhooksAllowed: plan.features.webhooks && settings.webhooksEnabled,
    },
  }
}

class CapReachedError extends Error {}
class SlotTakenError extends Error {
  constructor(public fieldId: string) {
    super("slot_taken")
  }
}

const NUMERIC_TYPES = new Set(["number", "rating", "scale", "calculated", "currency", "slider"])

type Tx = Pick<typeof prisma, "$queryRaw">

/** True when another submission already holds `date`/`time` for appointment field `key`. */
export async function slotTaken(tx: Tx, formId: string, key: string, date: string, time: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(key)) return false
  const rows = await tx.$queryRaw<{ n: bigint | number }[]>`
    SELECT COUNT(*) AS n FROM Submission
    WHERE formId = ${formId}
      AND status <> 'ARCHIVED'
      AND JSON_UNQUOTE(JSON_EXTRACT(data, ${`$.${key}.date`})) = ${date}
      AND JSON_UNQUOTE(JSON_EXTRACT(data, ${`$.${key}.time`})) = ${time}`
  return Number(rows[0]?.n ?? 0) > 0
}

/** Slots already booked for an appointment field on a given day. */
export async function takenSlots(formId: string, key: string, date: string): Promise<string[]> {
  if (!/^[a-zA-Z0-9_]+$/.test(key) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  const rows = await prisma.$queryRaw<{ t: string | null }[]>`
    SELECT JSON_UNQUOTE(JSON_EXTRACT(data, ${`$.${key}.time`})) AS t FROM Submission
    WHERE formId = ${formId}
      AND status <> 'ARCHIVED'
      AND JSON_UNQUOTE(JSON_EXTRACT(data, ${`$.${key}.date`})) = ${date}`
  return rows.map((r) => r.t).filter((t): t is string => !!t)
}

/** Side effects after a stored submission: webhooks, automations, emails. */
export async function runPostSubmit(ctx: PostSubmitContext) {
  const { form, schema, settings, submission, clean, data, completion } = ctx
  const payload = {
    event: "submission.created",
    createdAt: submission.createdAt.toISOString(),
    form: { id: form.id, title: form.title, slug: form.slug },
    submission: { id: submission.id, score: submission.computedScore, data },
  }
  const tasks: Promise<unknown>[] = []
  if (ctx.webhooksAllowed) tasks.push(dispatchFormWebhooks(form.id, "submission.created", payload))
  tasks.push(
    dispatchAutomationTrigger(form.id, "FORM_SUBMITTED", { submissionId: submission.id }),
    submission.computedScore !== null ? dispatchAutomationTrigger(form.id, "QUIZ_SCORE", { submissionId: submission.id }) : Promise.resolve()
  )

  const respondentEmail = settings.respondentEmailFieldId ? clean[settings.respondentEmailFieldId] : null
  if (settings.autoReply.enabled && typeof respondentEmail === "string" && respondentEmail.includes("@")) {
    tasks.push(
      buildThankYouEmail({
        formTitle: form.title,
        theme: form.themeConfig,
        schema,
        values: clean,
        visibleFieldIds: ctx.visibleFieldIds,
        submissionId: submission.id,
        submittedAt: submission.createdAt,
        config: settings.autoReply,
        receiptPath: settings.showReceipt ? receiptPath(form.slug, submission.id) : null,
        extras: { score: completion.score, max_score: completion.maxScore, outcome: completion.outcomeTitle },
        canReply: !!(settings.autoReply.replyTo || settings.notifyEmails[0]),
      }).then((mail) =>
        sendEmail({
          to: [respondentEmail],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          fromName: mail.fromName,
          replyTo: settings.autoReply.replyTo || settings.notifyEmails[0],
          source: `receipt:${submission.id}`,
          workspaceId: form.workspaceId,
        })
      )
    )
  }
  if (settings.notifyEmails.length) {
    tasks.push(
      buildNewResponseEmail({
        formId: form.id,
        formTitle: form.title,
        theme: form.themeConfig,
        rows: answerRows(schema, clean, ctx.visibleFieldIds),
        submissionId: submission.id,
      }).then((mail) =>
        sendEmail({
          to: settings.notifyEmails,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          replyTo: typeof respondentEmail === "string" ? respondentEmail : undefined,
          source: `notify:${submission.id}`,
          workspaceId: form.workspaceId,
        })
      )
    )
  }
  await Promise.allSettled(tasks)
}
