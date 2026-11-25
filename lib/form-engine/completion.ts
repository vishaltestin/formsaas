import { pipe } from "./format"
import type { LogicResult } from "./logic"
import { computeScore, findOutcome, hasScoring, maxScore } from "./score"
import type { FormMode, FormSchema, FormValues, PublicFormSettings } from "./types"

export interface CompletionResult {
  title: string
  message: string
  redirectUrl: string | null
  redirectDelay: number
  forwardParams: boolean
  ctaLabel: string | null
  ctaUrl: string | null
  score: number | null
  maxScore: number | null
  outcomeTitle: string | null
  showReceipt: boolean
}

/**
 * Resolves the ending a respondent sees after submitting: logic endings
 * (redirect / custom thank-you) override form settings; quiz outcomes are
 * applied by score band; every string is answer-piped.
 */
export function resolveCompletion(
  schema: FormSchema,
  settings: PublicFormSettings,
  values: FormValues,
  logic: LogicResult,
  mode: FormMode
): CompletionResult {
  const scoring = mode === "QUIZ" || hasScoring(schema)
  const score = scoring ? computeScore(schema, values, logic.visibleFieldIds) : null
  const max = scoring ? maxScore(schema) : null
  const outcome = score !== null ? findOutcome(schema, score) : null
  const extras = {
    score,
    max_score: max,
    outcome: outcome?.title ?? null,
  }
  const p = (s: string | undefined | null) => pipe(s ?? "", schema, { ...values, ...logic.setValues }, extras)

  let title = p(settings.successTitle) || "Thank you!"
  let message = p(settings.successMessage)
  if (mode === "QUIZ" && outcome) {
    title = p(outcome.title)
    message = p(outcome.message)
  }
  if (logic.ending?.title) title = p(logic.ending.title)
  if (logic.ending?.message) message = p(logic.ending.message)

  let redirectUrl: string | null = null
  if (logic.ending?.redirectUrl) redirectUrl = p(logic.ending.redirectUrl)
  else if (settings.redirectEnabled && settings.redirectUrl) redirectUrl = p(settings.redirectUrl)
  if (redirectUrl && !/^https?:\/\//i.test(redirectUrl)) redirectUrl = null

  return {
    title,
    message,
    redirectUrl,
    redirectDelay: Math.max(0, Math.min(30, settings.redirectDelay ?? 3)),
    forwardParams: !!settings.forwardParams,
    ctaLabel: settings.ctaLabel ? p(settings.ctaLabel) : null,
    ctaUrl: settings.ctaUrl || null,
    score: mode === "QUIZ" && !schema.quiz.revealScore ? null : score,
    maxScore: mode === "QUIZ" && !schema.quiz.revealScore ? null : max,
    outcomeTitle: outcome?.title ? p(outcome.title) : null,
    showReceipt: settings.showReceipt,
  }
}

/** Form availability (status, schedule, response cap). */
export function availability(
  status: "DRAFT" | "PUBLISHED" | "CLOSED",
  settings: Pick<PublicFormSettings, "opensAt" | "closesAt" | "maxSubmissions" | "closedMessage">,
  submissionCount: number,
  now = new Date()
): { open: true } | { open: false; reason: "draft" | "closed" | "scheduled" | "ended" | "cap"; message: string } {
  if (status === "DRAFT") return { open: false, reason: "draft", message: "This form hasn't been published yet." }
  if (status === "CLOSED") return { open: false, reason: "closed", message: settings.closedMessage }
  if (settings.opensAt && new Date(settings.opensAt) > now)
    return {
      open: false,
      reason: "scheduled",
      message: `This form opens on ${new Date(settings.opensAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.`,
    }
  if (settings.closesAt && new Date(settings.closesAt) < now)
    return { open: false, reason: "ended", message: settings.closedMessage }
  if (settings.maxSubmissions && settings.maxSubmissions > 0 && submissionCount >= settings.maxSubmissions)
    return { open: false, reason: "cap", message: "This form has reached its maximum number of responses." }
  return { open: true }
}
