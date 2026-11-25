"use server"

import { createHash } from "node:crypto"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import {
  renderCustomEmail,
  sampleVars,
  TemplateError,
  validateTemplateSource,
} from "@/lib/email/custom-template"
import { providerDescription, type EmailProvider } from "@/lib/email/providers"
import {
  ASSET_BYTES_PER_WORKSPACE,
  ASSET_MAX_BYTES,
  ASSETS_PER_WORKSPACE,
  TEMPLATE_HTML_MAX,
  TEMPLATES_PER_WORKSPACE,
  TEMPLATE_STARTERS,
} from "@/lib/email/template-library"
import {
  assetPath,
  assetUrl,
  CUSTOM_EMAIL_PLAN_MESSAGE,
  safeAssetName,
  sniffImageType,
  workspaceAllowsCustomEmail,
} from "@/lib/email/template-store"
import { normalizeSchema } from "@/lib/form-engine"
import { appUrl } from "@/lib/format"
import { sendEmail } from "@/lib/notify"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/public-form"
import { roleCan } from "@/lib/rbac/policy"
import {
  assertFormAccess,
  assertWorkspacePermission,
  audit,
  ForbiddenError,
} from "@/lib/rbac/server"

const id = z.string().min(1).max(64)

const templateInput = z.object({
  name: z.string().trim().min(1, "Give the template a name.").max(80),
  description: z.string().trim().max(300).optional().default(""),
  subject: z.string().trim().max(200).default(""),
  html: z
    .string()
    .max(
      TEMPLATE_HTML_MAX,
      `Templates can be up to ${TEMPLATE_HTML_MAX / 1000} KB.`
    ),
})

export type TemplateInput = z.input<typeof templateInput>

function revalidate(templateId?: string) {
  revalidatePath("/dashboard/settings/email-templates")
  if (templateId)
    revalidatePath(`/dashboard/settings/email-templates/${templateId}`)
}

async function assertPlan(workspaceId: string) {
  if (!(await workspaceAllowsCustomEmail(workspaceId)))
    throw new ForbiddenError(CUSTOM_EMAIL_PLAN_MESSAGE)
}

function templateFail(e: unknown) {
  if (e instanceof TemplateError)
    return {
      ok: false as const,
      error: e.message,
      code: e.line ? `line:${e.line}` : "template",
    }
  if (e instanceof z.ZodError)
    return {
      ok: false as const,
      error: e.issues[0]?.message ?? "Check the template fields.",
    }
  if (
    e &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  )
    return {
      ok: false as const,
      error: "A template with that name already exists.",
    }
  return fail(e)
}

/** Creates a template (from a starter) or updates one. Editors and above; Pro+ workspaces. */
export async function saveEmailTemplate(
  workspaceId: string,
  templateId: string | null,
  input: TemplateInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, membership } = await assertWorkspacePermission(
      id.parse(workspaceId),
      "templates.manage"
    )
    await assertPlan(membership.workspaceId)
    const data = templateInput.parse(input)
    validateTemplateSource(data.html, data.subject)
    if (templateId) {
      const existing = await prisma.emailTemplate.findFirst({
        where: {
          id: id.parse(templateId),
          workspaceId: membership.workspaceId,
        },
        select: { id: true },
      })
      if (!existing) throw new ForbiddenError("Template not found.")
      await prisma.emailTemplate.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          description: data.description || null,
          subject: data.subject,
          html: data.html,
          updatedById: user.id,
        },
      })
      await audit({
        workspaceId: membership.workspaceId,
        actorId: user.id,
        action: "email_template.update",
        summary: `Updated email template “${data.name}”`,
        targetType: "email_template",
        targetId: existing.id,
      })
      revalidate(existing.id)
      return ok({ id: existing.id })
    }
    const count = await prisma.emailTemplate.count({
      where: { workspaceId: membership.workspaceId },
    })
    if (count >= TEMPLATES_PER_WORKSPACE)
      throw new Error(
        `A workspace can have up to ${TEMPLATES_PER_WORKSPACE} templates.`
      )
    const created = await prisma.emailTemplate.create({
      data: {
        workspaceId: membership.workspaceId,
        name: data.name,
        description: data.description || null,
        subject: data.subject,
        html: data.html,
        createdById: user.id,
        updatedById: user.id,
      },
    })
    await audit({
      workspaceId: membership.workspaceId,
      actorId: user.id,
      action: "email_template.create",
      summary: `Created email template “${data.name}”`,
      targetType: "email_template",
      targetId: created.id,
    })
    revalidate()
    return ok({ id: created.id })
  } catch (e) {
    return templateFail(e)
  }
}

/** New template from a starter design; picks a free name. */
export async function createEmailTemplateFromStarter(
  workspaceId: string,
  starterId: string
): Promise<ActionResult<{ id: string }>> {
  const starter =
    TEMPLATE_STARTERS.find((s) => s.id === starterId) ?? TEMPLATE_STARTERS[0]
  try {
    const { membership } = await assertWorkspacePermission(
      id.parse(workspaceId),
      "templates.manage"
    )
    const names = new Set(
      (
        await prisma.emailTemplate.findMany({
          where: { workspaceId: membership.workspaceId },
          select: { name: true },
        })
      ).map((t) => t.name)
    )
    let name = starter.name
    for (let i = 2; names.has(name); i++) name = `${starter.name} ${i}`
    return saveEmailTemplate(workspaceId, null, {
      name,
      description: starter.description,
      subject: starter.subject,
      html: starter.html,
    })
  } catch (e) {
    return templateFail(e)
  }
}

export async function duplicateEmailTemplate(
  workspaceId: string,
  templateId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const { membership } = await assertWorkspacePermission(
      id.parse(workspaceId),
      "templates.manage"
    )
    const src = await prisma.emailTemplate.findFirst({
      where: { id: id.parse(templateId), workspaceId: membership.workspaceId },
    })
    if (!src) throw new ForbiddenError("Template not found.")
    const names = new Set(
      (
        await prisma.emailTemplate.findMany({
          where: { workspaceId: membership.workspaceId },
          select: { name: true },
        })
      ).map((t) => t.name)
    )
    let name = `${src.name} copy`.slice(0, 80)
    for (let i = 2; names.has(name); i++)
      name = `${src.name.slice(0, 70)} copy ${i}`
    return saveEmailTemplate(workspaceId, null, {
      name,
      description: src.description ?? "",
      subject: src.subject,
      html: src.html,
    })
  } catch (e) {
    return templateFail(e)
  }
}

/** Deletes a template. Forms/automations still pointing at it fall back to the built-in design. */
export async function deleteEmailTemplate(
  workspaceId: string,
  templateId: string
): Promise<ActionResult<null>> {
  try {
    const { user, membership } = await assertWorkspacePermission(
      id.parse(workspaceId),
      "templates.manage"
    )
    const t = await prisma.emailTemplate.findFirst({
      where: { id: id.parse(templateId), workspaceId: membership.workspaceId },
      select: { id: true, name: true },
    })
    if (!t) throw new ForbiddenError("Template not found.")
    await prisma.emailTemplate.delete({ where: { id: t.id } })
    await audit({
      workspaceId: membership.workspaceId,
      actorId: user.id,
      action: "email_template.delete",
      summary: `Deleted email template “${t.name}”`,
      targetType: "email_template",
      targetId: t.id,
    })
    revalidate()
    return ok(null)
  } catch (e) {
    return templateFail(e)
  }
}

const previewInput = z.object({
  html: z.string().max(TEMPLATE_HTML_MAX),
  subject: z.string().max(200),
  formId: z.string().max(64).optional().nullable(),
})

async function previewContext(workspaceId: string, formId?: string | null) {
  const { user, membership } = await assertWorkspacePermission(
    id.parse(workspaceId),
    "workspace.view"
  )
  const ws = await prisma.workspace.findUnique({
    where: { id: membership.workspaceId },
    select: { name: true },
  })
  let schema = null
  let formTitle = "Customer feedback"
  let fid = "form_sample"
  if (formId) {
    const { form } = await assertFormAccess(formId, "form.view")
    if (form.workspaceId !== membership.workspaceId)
      throw new ForbiddenError("That form belongs to another workspace.")
    schema = normalizeSchema(form.draftSchema)
    formTitle = form.title
    fid = form.id
  }
  const vars = sampleVars({
    schema,
    formTitle,
    workspaceName: ws?.name ?? "",
    receiptUrl: `${appUrl()}/r/sample/receipt`,
    dashboardUrl: `${appUrl()}/dashboard/forms/${fid}/submissions`,
  })
  return { user, membership, vars }
}

/** Renders the (unsaved) editor contents with sample answers — exactly what recipients get after sanitising and CSS inlining. */
export async function previewEmailTemplate(
  workspaceId: string,
  input: z.input<typeof previewInput>
): Promise<
  ActionResult<{ html: string; text: string; subject: string; bytes: number }>
> {
  try {
    const data = previewInput.parse(input)
    const { vars } = await previewContext(workspaceId, data.formId)
    validateTemplateSource(data.html, data.subject)
    const out = renderCustomEmail(
      { html: data.html, subject: data.subject },
      vars
    )
    return ok({ ...out, bytes: Buffer.byteLength(out.html) })
  } catch (e) {
    return templateFail(e)
  }
}

/** Sends the editor contents (sample answers) to the signed-in user. */
export async function sendEmailTemplateTest(
  workspaceId: string,
  input: z.input<typeof previewInput>
): Promise<
  ActionResult<{
    provider: EmailProvider
    label: string
    to: string
    sent: boolean
    error?: string
  }>
> {
  try {
    const data = previewInput.parse(input)
    const { user, membership, vars } = await previewContext(
      workspaceId,
      data.formId
    )
    if (!roleCan(membership.role, "templates.manage"))
      throw new ForbiddenError()
    await assertPlan(membership.workspaceId)
    if (!user.email)
      throw new Error("Your account has no email address to send the test to.")
    if (!(await rateLimit(`tpl-test:${user.id}`, 10, 10 * 60_000)))
      throw new Error("Too many test emails — try again in a few minutes.")
    validateTemplateSource(data.html, data.subject)
    const out = renderCustomEmail(
      { html: data.html, subject: data.subject },
      vars
    )
    const res = await sendEmail({
      to: [user.email],
      subject: `[Test] ${out.subject || "Email template"}`,
      html: out.html,
      text: out.text,
      source: `template-test:${membership.workspaceId}`,
      workspaceId: membership.workspaceId,
    })
    return ok({
      provider: res.provider,
      label: providerDescription(res.provider),
      to: user.email,
      sent: res.sent,
      error: res.error,
    })
  } catch (e) {
    return templateFail(e)
  }
}

// ─── Images ─────────────────────────────────────────────────────────────────

export interface AssetInfo {
  id: string
  name: string
  mime: string
  size: number
  /** Absolute URL for emails */
  url: string
  /** Same-origin path for thumbnails in the app */
  path: string
  createdAt: string
}

/** Uploads an image for templates (PNG/JPEG/GIF/WebP, ≤ 2 MB, verified by magic bytes). */
export async function uploadEmailAsset(
  workspaceId: string,
  formData: FormData
): Promise<ActionResult<AssetInfo>> {
  try {
    const { user, membership } = await assertWorkspacePermission(
      id.parse(workspaceId),
      "templates.manage"
    )
    await assertPlan(membership.workspaceId)
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0)
      throw new Error("Choose an image to upload.")
    if (file.size > ASSET_MAX_BYTES)
      throw new Error(
        `Images can be up to ${ASSET_MAX_BYTES / 1024 / 1024} MB.`
      )
    const buf = new Uint8Array(await file.arrayBuffer())
    const mime = sniffImageType(buf)
    if (!mime)
      throw new Error("Only PNG, JPEG, GIF and WebP images are supported.")
    const agg = await prisma.workspaceAsset.aggregate({
      where: { workspaceId: membership.workspaceId },
      _count: true,
      _sum: { size: true },
    })
    if (agg._count >= ASSETS_PER_WORKSPACE)
      throw new Error(
        `A workspace can store up to ${ASSETS_PER_WORKSPACE} images. Delete some first.`
      )
    if ((agg._sum.size ?? 0) + buf.length > ASSET_BYTES_PER_WORKSPACE)
      throw new Error(
        `Image storage is full (${ASSET_BYTES_PER_WORKSPACE / 1024 / 1024} MB). Delete some images first.`
      )
    const asset = await prisma.workspaceAsset.create({
      data: {
        workspaceId: membership.workspaceId,
        name: safeAssetName(file.name, mime),
        mime,
        size: buf.length,
        sha256: createHash("sha256").update(buf).digest("hex"),
        data: Buffer.from(buf),
        createdById: user.id,
      },
      select: { id: true, name: true, mime: true, size: true, createdAt: true },
    })
    await audit({
      workspaceId: membership.workspaceId,
      actorId: user.id,
      action: "email_asset.upload",
      summary: `Uploaded image ${asset.name}`,
      targetType: "asset",
      targetId: asset.id,
    })
    revalidate()
    return ok({
      ...asset,
      url: assetUrl(asset),
      path: assetPath(asset),
      createdAt: asset.createdAt.toISOString(),
    })
  } catch (e) {
    return fail(e)
  }
}

export async function deleteEmailAsset(
  workspaceId: string,
  assetId: string
): Promise<ActionResult<null>> {
  try {
    const { user, membership } = await assertWorkspacePermission(
      id.parse(workspaceId),
      "templates.manage"
    )
    const asset = await prisma.workspaceAsset.findFirst({
      where: { id: id.parse(assetId), workspaceId: membership.workspaceId },
      select: { id: true, name: true },
    })
    if (!asset) throw new ForbiddenError("Image not found.")
    await prisma.workspaceAsset.delete({ where: { id: asset.id } })
    await audit({
      workspaceId: membership.workspaceId,
      actorId: user.id,
      action: "email_asset.delete",
      summary: `Deleted image ${asset.name}`,
      targetType: "asset",
      targetId: asset.id,
    })
    revalidate()
    return ok(null)
  } catch (e) {
    return fail(e)
  }
}
