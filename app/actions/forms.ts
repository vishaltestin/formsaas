"use server"

import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { assertEntitlement, getEffectivePlan } from "@/lib/entitlements"
import {
  FORM_MODES,
  isInputField,
  normalizeSchema,
  normalizeSettings,
  normalizeTheme,
  type FormMode,
  type FormSchema,
  type FormSettings,
  type LogicRule,
  type ThemeConfig,
} from "@/lib/form-engine"
import { prisma } from "@/lib/prisma"
import { roleCan } from "@/lib/rbac/policy"
import { assertFormAccess, audit, ForbiddenError, getMembership, getWorkspaceContext } from "@/lib/rbac/server"
import { assertUser } from "@/lib/session"
import { assertUniqueKeys, createFormRecord, publishFormRecord, uniqueSlug } from "@/lib/forms/service"

function revalidateForm(formId: string) {
  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/forms/${formId}`, "layout")
}

const createSchema = z.object({
  title: z.string().trim().max(120).optional(),
  templateId: z.string().optional(),
  mode: z.enum(FORM_MODES).optional(),
})

export async function createForm(input: z.infer<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertUser()
    const parsed = createSchema.parse(input)
    // The active workspace is resolved server-side and only honoured while the user is a member.
    const { active } = await getWorkspaceContext(user.id)
    if (!roleCan(active.role, "form.create")) throw new ForbiddenError("Your role in this workspace can't create forms. Ask an admin for Editor access.")
    const form = await createFormRecord(
      { workspaceId: active.workspaceId, ownerId: active.ownerId, createdById: user.id },
      { title: parsed.title, templateId: parsed.templateId, mode: parsed.mode }
    )
    revalidatePath("/dashboard")
    return ok({ id: form.id })
  } catch (e) {
    return fail(e)
  }
}

export async function duplicateForm(formId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, form } = await assertFormAccess(formId, "form.duplicate")
    const membership = await getMembership(user.id, form.workspaceId)
    if (!membership || !roleCan(membership.role, "form.create")) throw new ForbiddenError("Your role in this workspace can't create forms.")
    await assertEntitlement(membership.ownerId, "form.create")
    const copy = await prisma.form.create({
      data: {
        userId: membership.ownerId,
        workspaceId: form.workspaceId,
        createdById: user.id,
        title: `${form.title} (copy)`,
        description: form.description,
        slug: await uniqueSlug(form.title),
        mode: form.mode,
        draftSchema: form.draftSchema as object,
        themeConfig: form.themeConfig as object,
        settings: { ...normalizeSettings(form.settings), passwordHash: null, passwordEnabled: false } as object,
      },
    })
    revalidatePath("/dashboard")
    return ok({ id: copy.id })
  } catch (e) {
    return fail(e)
  }
}

export async function deleteForm(formId: string): Promise<ActionResult> {
  try {
    const { user, form } = await assertFormAccess(formId, "form.delete")
    await prisma.form.delete({ where: { id: formId } })
    await audit({ workspaceId: form.workspaceId, actorId: user.id, action: "form.deleted", summary: `Deleted form “${form.title}”`, targetType: "form", targetId: form.id })
    revalidatePath("/dashboard")
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}

const draftSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  mode: z.enum(FORM_MODES),
  schema: z.object({ fields: z.array(z.any()).max(300), logic: z.array(z.any()).max(200) }).passthrough(),
  theme: z.object({ colors: z.object({}).passthrough() }).passthrough(),
  settings: z.object({}).passthrough(),
})

export async function saveDraft(
  formId: string,
  input: { title: string; mode: FormMode; schema: FormSchema; theme: ThemeConfig; settings: FormSettings }
): Promise<ActionResult<{ savedAt: string }>> {
  try {
    const { form } = await assertFormAccess(formId, "form.edit")
    const parsed = draftSchema.parse(input)
    const schema = normalizeSchema(parsed.schema)

    assertUniqueKeys(schema)

    const theme = normalizeTheme(parsed.theme)
    if (theme.customCss.length > 20000) throw new Error("Custom CSS is too large (20 KB max).")
    if ((theme.logoUrl?.length ?? 0) > 700_000 || (theme.coverUrl?.length ?? 0) > 1_500_000)
      throw new Error("Logo or cover image is too large.")
    // Self-hosted font files are a branding feature; Google Fonts work on every plan.
    if ((theme.customFonts?.length ?? 0) > 0 && !(await getEffectivePlan(form.userId)).features.customBranding) {
      const uploaded = new Set((theme.customFonts ?? []).map((f) => f.family))
      theme.customFonts = []
      if (uploaded.has(theme.fontFamily)) theme.fontFamily = "Inter"
      if (theme.headingFont && uploaded.has(theme.headingFont)) theme.headingFont = undefined
    }

    const existing = normalizeSettings(form.settings)
    const settings = normalizeSettings(parsed.settings)
    // The password hash is never round-tripped through the client.
    settings.passwordHash = existing.passwordHash ?? null
    settings.passwordEnabled = !!settings.passwordEnabled && !!settings.passwordHash

    const updated = await prisma.form.update({
      where: { id: formId },
      data: {
        title: parsed.title,
        mode: parsed.mode,
        draftSchema: schema as object,
        themeConfig: theme as object,
        settings: settings as object,
      },
    })
    return ok({ savedAt: updated.updatedAt.toISOString() })
  } catch (e) {
    return fail(e)
  }
}

export async function publishForm(formId: string): Promise<ActionResult<{ version: number; slug: string }>> {
  try {
    const { form } = await assertFormAccess(formId, "form.publish")
    const { version: versionNumber } = await publishFormRecord(form)
    revalidateForm(formId)
    revalidatePath(`/f/${form.slug}`)
    return ok({ version: versionNumber, slug: form.slug })
  } catch (e) {
    return fail(e)
  }
}

export async function setFormStatus(
  formId: string,
  status: "DRAFT" | "PUBLISHED" | "CLOSED"
): Promise<ActionResult> {
  try {
    const { form } = await assertFormAccess(formId, "form.publish")
    if (status === "PUBLISHED" && !form.publishedSchema) throw new Error("Publish the form first.")
    await prisma.form.update({ where: { id: formId }, data: { status } })
    revalidateForm(formId)
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}

export async function restoreVersion(
  formId: string,
  versionId: string
): Promise<ActionResult<{ schema: FormSchema; theme: ThemeConfig }>> {
  try {
    await assertFormAccess(formId, "form.edit")
    const version = await prisma.formVersion.findFirst({ where: { id: versionId, formId } })
    if (!version) throw new Error("Version not found")
    const schema = normalizeSchema(version.schema)
    const theme = normalizeTheme(version.themeConfig)
    await prisma.form.update({
      where: { id: formId },
      data: { draftSchema: schema as object, themeConfig: theme as object },
    })
    revalidateForm(formId)
    return ok({ schema, theme })
  } catch (e) {
    return fail(e)
  }
}

export async function listVersions(formId: string) {
  await assertFormAccess(formId, "form.edit")
  const versions = await prisma.formVersion.findMany({
    where: { formId },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true, createdAt: true, schema: true },
    take: 50,
  })
  return versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    createdAt: v.createdAt.toISOString(),
    fieldCount: normalizeSchema(v.schema).fields.filter(isInputField).length,
  }))
}

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters")
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes")

export async function updateSlug(formId: string, slug: string): Promise<ActionResult<{ slug: string }>> {
  try {
    const { form } = await assertFormAccess(formId, "form.share")
    const next = slugSchema.parse(slug)
    if (["admin", "dashboard", "api", "embed", "login", "register"].includes(next))
      throw new Error("That slug is reserved")
    const taken = await prisma.form.findUnique({ where: { slug: next }, select: { id: true } })
    if (taken && taken.id !== formId) throw new Error("That link is already taken")
    await prisma.form.update({ where: { id: formId }, data: { slug: next } })
    revalidateForm(formId)
    revalidatePath(`/f/${form.slug}`)
    return ok({ slug: next })
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid slug" }
    return fail(e)
  }
}

export async function setFormPassword(formId: string, password: string | null): Promise<ActionResult> {
  try {
    const { form } = await assertFormAccess(formId, "form.share")
    const settings = normalizeSettings(form.settings)
    if (password) {
      if (password.length < 4) throw new Error("Use at least 4 characters")
      settings.passwordHash = await bcrypt.hash(password, 10)
      settings.passwordEnabled = true
    } else {
      settings.passwordHash = null
      settings.passwordEnabled = false
    }
    await prisma.form.update({ where: { id: formId }, data: { settings: settings as object } })
    revalidateForm(formId)
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}

export async function saveLogic(
  formId: string,
  logic: LogicRule[],
  logicLayout: FormSchema["logicLayout"]
): Promise<ActionResult<{ savedAt: string }>> {
  try {
    const { form } = await assertFormAccess(formId, "form.edit")
    // Plan features belong to the billing owner (the workspace owner), not the editor.
    if (logic.some((r) => r.enabled)) await assertEntitlement(form.userId, "conditionalLogic")
    const schema = normalizeSchema(form.draftSchema)
    const ids = new Set(schema.fields.map((f) => f.id))
    // Drop conditions/actions that reference deleted fields.
    const clean = z
      .array(z.any())
      .max(200)
      .parse(logic)
      .map((r: LogicRule) => ({
        ...r,
        conditions: (r.conditions ?? []).filter((c) => ids.has(c.fieldId)),
        actions: (r.actions ?? []).filter((a) => !a.targetFieldId || ids.has(a.targetFieldId)),
      }))
    schema.logic = clean
    schema.logicLayout = logicLayout ?? {}
    const updated = await prisma.form.update({
      where: { id: formId },
      data: { draftSchema: schema as object },
    })
    revalidateForm(formId)
    return ok({ savedAt: updated.updatedAt.toISOString() })
  } catch (e) {
    return fail(e)
  }
}

export async function updateFormMeta(
  formId: string,
  input: { title?: string; description?: string }
): Promise<ActionResult> {
  try {
    await assertFormAccess(formId, "form.edit")
    const data = z
      .object({ title: z.string().trim().min(1).max(120).optional(), description: z.string().max(500).optional() })
      .parse(input)
    await prisma.form.update({ where: { id: formId }, data })
    revalidateForm(formId)
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}
