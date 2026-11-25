import "server-only"

import {
  buildTemplateVars,
  renderCustomEmail,
} from "@/lib/email/custom-template"
import {
  NewResponseEmail,
  ThankYouEmail,
  type AnswerRow,
} from "@/lib/email/templates"
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
export const AUTO_REPLY_TAGS = [
  "form_title",
  "submission_id",
  "submitted_at",
] as const

export function answerRows(
  schema: FormSchema,
  values: FormValues,
  visible?: Set<string>
): AnswerRow[] {
  return schema.fields
    .filter(
      (f) =>
        (!visible || visible.has(f.id)) &&
        isInputField(f) &&
        f.type !== "password" &&
        f.type !== "hidden" &&
        f.type !== "signature"
    )
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
  /** Workspace HTML template (already plan/workspace checked); null = built-in design */
  template?: CustomTemplate | null
  workspaceName?: string
}) {
  const { config, schema, values } = input
  const extras = {
    form_title: input.formTitle,
    submission_id: input.submissionId,
    submitted_at: input.submittedAt.toUTCString(),
    ...input.extras,
  }
  const receiptUrl = input.receiptPath
    ? `${appUrl()}${input.receiptPath}`
    : null
  if (input.template) {
    const custom = tryCustom(
      input.template,
      {
        schema,
        values,
        visibleFieldIds: input.visibleFieldIds,
        extras: {
          ...extras,
          receipt_url: receiptUrl,
          workspace_name: input.workspaceName ?? "",
        },
      },
      config.subject
    )
    if (custom)
      return {
        ...custom,
        subject:
          custom.subject || `Thanks for your response · ${input.formTitle}`,
        fromName: config.fromName || input.formTitle,
        template: input.template.name,
      }
  }
  const subject =
    pipe(config.subject, schema, values, extras).trim() ||
    `Thanks for your response · ${input.formTitle}`
  const heading =
    pipe(config.heading, schema, values, extras).trim() || "Thank you"
  const body = pipe(config.body, schema, values, extras)
  const answers = config.includeAnswers
    ? answerRows(schema, values, input.visibleFieldIds)
    : []
  const accent = normalizeTheme(input.theme).colors.primary
  const { html, text } = await renderEmail(
    <ThankYouEmail
      formTitle={input.formTitle}
      heading={heading}
      body={body}
      answers={answers}
      accent={accent}
      receiptUrl={receiptUrl}
      canReply={input.canReply ?? true}
    />,
    { heading, body, rows: answers }
  )
  return {
    subject,
    html,
    text,
    fromName: config.fromName || input.formTitle,
    template: null as string | null,
  }
}

export interface CustomTemplate {
  id: string
  name: string
  subject: string
  html: string
}

type VarsInput = Parameters<typeof buildTemplateVars>[0]

/** Renders a workspace template; on a template bug logs and returns null so the built-in design is sent instead. */
function tryCustom(
  template: CustomTemplate,
  vars: VarsInput,
  subjectOverride?: string
) {
  try {
    const extras = { ...vars.extras }
    if (extras.max_score !== undefined) extras.maxScore = extras.max_score
    return renderCustomEmail(template, buildTemplateVars({ ...vars, extras }), {
      subjectOverride,
    })
  } catch (e) {
    console.error(
      `[email] custom template ${template.id} failed, using the built-in design:`,
      e instanceof Error ? e.message : e
    )
    return null
  }
}

export async function buildNewResponseEmail(input: {
  formId: string
  formTitle: string
  theme: unknown
  rows: AnswerRow[]
  submissionId: string
  submittedAt?: Date
  template?: CustomTemplate | null
  schema?: FormSchema
  values?: FormValues
  visibleFieldIds?: Set<string>
  workspaceName?: string
}) {
  const dashboardUrl = `${appUrl()}/dashboard/forms/${input.formId}/submissions`
  if (input.template && input.schema && input.values) {
    const custom = tryCustom(input.template, {
      schema: input.schema,
      values: input.values,
      visibleFieldIds: input.visibleFieldIds,
      extras: {
        form_title: input.formTitle,
        submission_id: input.submissionId,
        submitted_at: (input.submittedAt ?? new Date()).toUTCString(),
        dashboard_url: `${dashboardUrl}?id=${encodeURIComponent(input.submissionId)}`,
        workspace_name: input.workspaceName ?? "",
      },
    })
    if (custom)
      return {
        subject: custom.subject || `New response · ${input.formTitle}`,
        html: custom.html,
        text: custom.text,
        template: input.template.name,
      }
  }
  const { html, text } = await renderEmail(
    <NewResponseEmail
      formTitle={input.formTitle}
      answers={input.rows}
      dashboardUrl={dashboardUrl}
      accent={normalizeTheme(input.theme).colors.primary}
    />,
    {
      heading: `New response · ${input.formTitle}`,
      body: dashboardUrl,
      rows: input.rows,
    }
  )
  return {
    subject: `New response · ${input.formTitle}`,
    html,
    text,
    template: null as string | null,
  }
}
