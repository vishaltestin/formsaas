import "server-only"

import { NewResponseEmail, ThankYouEmail, type AnswerRow } from "@/lib/email/templates"
import { renderEmail } from "@/lib/email/render"
import {
  formatValue,
  isInputField,
  normalizeTheme,
  pipe,
  type AutoReplySettings,
  type FormSchema,
  type FormValues,
} from "@/lib/form-engine"
import { appUrl } from "@/lib/format"

/** Merge tags available in every auto-reply, on top of {{field_key}} answers. */
export const AUTO_REPLY_TAGS = ["form_title", "submission_id", "submitted_at"] as const

export function answerRows(schema: FormSchema, values: FormValues, visible?: Set<string>): AnswerRow[] {
  return schema.fields
    .filter((f) => (!visible || visible.has(f.id)) && isInputField(f) && f.type !== "password" && f.type !== "hidden" && f.type !== "signature")
    .map((f) => ({ label: f.label, value: formatValue(f, values[f.id]) }))
    .filter((r) => r.value !== "")
}

/**
 * Builds the respondent thank-you email: subject, heading and body are
 * merge-tag interpolated with the respondent's answers, then rendered with
 * the React Email template in the form's primary colour.
 */
export async function buildThankYouEmail(input: {
  formTitle: string
  theme: unknown
  schema: FormSchema
  values: FormValues
  visibleFieldIds?: Set<string>
  submissionId: string
  submittedAt: Date
  config: AutoReplySettings
  receiptPath?: string | null
  extras?: Record<string, string | number | null>
  canReply?: boolean
}) {
  const { config, schema, values } = input
  const extras = {
    form_title: input.formTitle,
    submission_id: input.submissionId,
    submitted_at: input.submittedAt.toUTCString(),
    ...input.extras,
  }
  const subject = pipe(config.subject, schema, values, extras).trim() || `Thanks for your response · ${input.formTitle}`
  const heading = pipe(config.heading, schema, values, extras).trim() || "Thank you"
  const body = pipe(config.body, schema, values, extras)
  const answers = config.includeAnswers ? answerRows(schema, values, input.visibleFieldIds) : []
  const accent = normalizeTheme(input.theme).colors.primary
  const receiptUrl = input.receiptPath ? `${appUrl()}${input.receiptPath}` : null
  const { html, text } = await renderEmail(
    <ThankYouEmail formTitle={input.formTitle} heading={heading} body={body} answers={answers} accent={accent} receiptUrl={receiptUrl} canReply={input.canReply ?? true} />,
    { heading, body, rows: answers }
  )
  return { subject, html, text, fromName: config.fromName || input.formTitle }
}

export async function buildNewResponseEmail(input: { formId: string; formTitle: string; theme: unknown; rows: AnswerRow[]; submissionId: string }) {
  const dashboardUrl = `${appUrl()}/dashboard/forms/${input.formId}/submissions`
  const { html, text } = await renderEmail(
    <NewResponseEmail formTitle={input.formTitle} answers={input.rows} dashboardUrl={dashboardUrl} accent={normalizeTheme(input.theme).colors.primary} />,
    { heading: `New response · ${input.formTitle}`, body: dashboardUrl, rows: input.rows }
  )
  return { subject: `New response · ${input.formTitle}`, html, text }
}
