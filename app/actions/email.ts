"use server"

import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { buildThankYouEmail } from "@/lib/email/auto-reply"
import { providerDescription, type EmailProvider } from "@/lib/email/providers"
import { normalizeSchema, normalizeSettings, sampleFieldValue, type FieldValue, type FormValues } from "@/lib/form-engine"
import { loadTemplateForSend } from "@/lib/email/template-store"
import { sendEmail } from "@/lib/notify"
import { prisma } from "@/lib/prisma"
import { assertFormAccess } from "@/lib/rbac/server"

const autoReplySchema = z.object({
  enabled: z.boolean(),
  subject: z.string().max(200),
  heading: z.string().max(200),
  body: z.string().max(5000),
  includeAnswers: z.boolean(),
  fromName: z.string().max(80),
  replyTo: z.string().max(200),
  templateId: z.string().max(64).nullable().optional(),
})

/**
 * Sends the current (unsaved) thank-you email draft to the signed-in owner,
 * filled with realistic sample answers, so they can check it in a real inbox.
 */
export async function sendTestAutoReply(
  formId: string,
  draft: z.infer<typeof autoReplySchema>
): Promise<ActionResult<{ provider: EmailProvider; label: string; to: string; sent: boolean; error?: string; template: string | null }>> {
  try {
    const { user, form } = await assertFormAccess(formId, "form.edit")
    const parsed = autoReplySchema.parse(draft)
    const config = { ...parsed, templateId: parsed.templateId ?? null }
    const [template, workspace] = await Promise.all([
      loadTemplateForSend(form.workspaceId, config.templateId),
      prisma.workspace.findUnique({ where: { id: form.workspaceId }, select: { name: true } }),
    ])
    if (!user.email) throw new Error("Your account has no email address to send the test to.")
    const schema = normalizeSchema(form.draftSchema)
    const settings = normalizeSettings(form.settings)
    const values: FormValues = {}
    for (const f of schema.fields) values[f.id] = sampleFieldValue(f) as FieldValue
    const mail = await buildThankYouEmail({
      formTitle: form.title,
      theme: form.themeConfig,
      schema,
      values,
      submissionId: "sub_test_preview",
      submittedAt: new Date(),
      config,
      template,
      workspaceName: workspace?.name,
      receiptPath: settings.showReceipt ? `/r/${form.slug}/sample` : null,
      canReply: !!(config.replyTo || settings.notifyEmails[0]),
    })
    const res = await sendEmail({
      to: [user.email],
      subject: `[Test] ${mail.subject}`,
      html: mail.html,
      text: mail.text,
      fromName: mail.fromName,
      replyTo: config.replyTo || settings.notifyEmails[0],
      source: `test:${form.id}`,
      workspaceId: form.workspaceId,
    })
    return ok({ provider: res.provider, label: providerDescription(res.provider), to: user.email, sent: res.sent, error: res.error, template: mail.template })
  } catch (e) {
    return fail(e)
  }
}
