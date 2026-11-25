import "server-only"

import type { Form } from "@/generated/prisma/client"
import { assertEntitlement } from "@/lib/entitlements"
import {
  defaultSchema,
  defaultSettings,
  defaultTheme,
  isInputField,
  normalizeSchema,
  type FormMode,
  type FormSchema,
} from "@/lib/form-engine"
import { prisma } from "@/lib/prisma"
import { getTemplate } from "@/lib/templates"

export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "form"
  )
}

export async function uniqueSlug(base: string) {
  const root = slugify(base)
  for (let i = 0; i < 8; i++) {
    const candidate = `${root}-${Math.random().toString(36).slice(2, 6)}`
    const exists = await prisma.form.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!exists) return candidate
  }
  return `${root}-${Date.now().toString(36)}`
}

/** Field keys must be unique — they are the stable identifiers in data, exports and the API. */
export function assertUniqueKeys(schema: FormSchema) {
  const keys = new Set<string>()
  for (const f of schema.fields) {
    if (!isInputField(f)) continue
    if (keys.has(f.key)) throw new Error(`Duplicate field key "${f.key}". Keys must be unique.`)
    keys.add(f.key)
  }
}

/**
 * Creates a form inside a workspace. The workspace owner is the billing owner
 * (plan limits count against them); `createdById` records who made it.
 * Callers must already have verified the creator may create forms there.
 */
export async function createFormRecord(
  target: { workspaceId: string; ownerId: string; createdById: string },
  input: { title?: string; description?: string | null; templateId?: string; mode?: FormMode; schema?: unknown }
) {
  await assertEntitlement(target.ownerId, "form.create")
  const template = input.templateId ? getTemplate(input.templateId) : null
  if (input.templateId && !template) throw new Error("Template not found")
  const title = input.title || template?.name || "Untitled form"
  const schema: FormSchema = input.schema ? normalizeSchema(input.schema) : (template?.schema ?? defaultSchema())
  assertUniqueKeys(schema)
  return prisma.form.create({
    data: {
      userId: target.ownerId,
      workspaceId: target.workspaceId,
      createdById: target.createdById,
      title,
      description: input.description ?? template?.description ?? null,
      slug: await uniqueSlug(title),
      mode: input.mode ?? template?.mode ?? "CLASSIC",
      draftSchema: schema as object,
      themeConfig: (template?.theme ?? defaultTheme()) as object,
      settings: (template?.settings ?? defaultSettings()) as object,
    },
  })
}

/**
 * Publishes the current draft: copies draftSchema → publishedSchema and
 * records an immutable FormVersion. The live form only ever reads the
 * published snapshot, so subsequent draft edits are isolated until the next publish.
 */
export async function publishFormRecord(form: Form) {
  const schema = normalizeSchema(form.draftSchema)
  if (!schema.fields.some(isInputField)) throw new Error("Add at least one question before publishing.")
  assertUniqueKeys(schema)
  if (schema.logic.some((r) => r.enabled)) await assertEntitlement(form.userId, "conditionalLogic")
  return prisma.$transaction(async (tx) => {
    const last = await tx.formVersion.findFirst({ where: { formId: form.id }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } })
    const versionNumber = (last?.versionNumber ?? 0) + 1
    const updated = await tx.form.update({
      where: { id: form.id },
      data: { publishedSchema: schema as object, status: "PUBLISHED", publishedAt: new Date() },
    })
    await tx.formVersion.create({ data: { formId: form.id, versionNumber, schema: schema as object, themeConfig: form.themeConfig as object } })
    return { form: updated, version: versionNumber }
  })
}
