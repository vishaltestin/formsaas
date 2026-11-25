"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { assertEntitlement } from "@/lib/entitlements"
import { isInputField, normalizeSchema, type FormField } from "@/lib/form-engine"
import { prisma } from "@/lib/prisma"
import { assertFormAccess } from "@/lib/rbac/server"
import { deliverWebhook } from "@/lib/webhooks"

const headerKey = /^[A-Za-z0-9-]{1,64}$/
const webhookInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  url: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), "URL must start with http:// or https://"),
  headers: z
    .array(z.object({ key: z.string().trim(), value: z.string().max(1000) }))
    .max(10)
    .default([])
    .transform((rows) => rows.filter((r) => r.key))
    .refine((rows) => rows.every((r) => headerKey.test(r.key)), "Header names may only contain letters, numbers and dashes")
    .refine(
      (rows) => rows.every((r) => !/^(content-type|content-length|host|x-formstudio-)/i.test(r.key)),
      "That header is reserved"
    ),
  isActive: z.boolean().default(true),
})
export type WebhookInput = z.input<typeof webhookInput>

function newSecret() {
  return `whsec_${randomBytes(24).toString("hex")}`
}

function revalidate(formId: string) {
  revalidatePath(`/dashboard/forms/${formId}/integrations`)
}

/** Loads a webhook and requires webhooks.manage on its form (live RBAC check). */
async function accessibleWebhook(webhookId: string) {
  const hook = await prisma.webhook.findUnique({ where: { id: z.string().min(1).max(40).parse(webhookId) } })
  if (!hook) throw new Error("Webhook not found")
  const { form } = await assertFormAccess(hook.formId, "webhooks.manage")
  return { hook, form }
}

async function ownedWebhook(webhookId: string) {
  const { hook, form } = await accessibleWebhook(webhookId)
  await assertEntitlement(form.userId, "webhooks")
  return hook
}

export async function createWebhook(formId: string, input: WebhookInput): Promise<ActionResult<{ id: string }>> {
  try {
    const { form } = await assertFormAccess(formId, "webhooks.manage")
    await assertEntitlement(form.userId, "webhooks")
    const data = webhookInput.parse(input)
    const count = await prisma.webhook.count({ where: { formId } })
    if (count >= 10) throw new Error("A form can have up to 10 webhooks")
    const hook = await prisma.webhook.create({
      data: {
        formId,
        name: data.name,
        url: data.url,
        isActive: data.isActive,
        headers: Object.fromEntries(data.headers.map((h) => [h.key, h.value])),
        secret: newSecret(),
      },
    })
    revalidate(formId)
    return ok({ id: hook.id })
  } catch (e) {
    return fail(e)
  }
}

export async function updateWebhook(webhookId: string, input: WebhookInput): Promise<ActionResult<{ id: string }>> {
  try {
    const hook = await ownedWebhook(webhookId)
    const data = webhookInput.parse(input)
    await prisma.webhook.update({
      where: { id: webhookId },
      data: {
        name: data.name,
        url: data.url,
        isActive: data.isActive,
        headers: Object.fromEntries(data.headers.map((h) => [h.key, h.value])),
      },
    })
    revalidate(hook.formId)
    return ok({ id: webhookId })
  } catch (e) {
    return fail(e)
  }
}

export async function toggleWebhook(webhookId: string, isActive: boolean): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    const hook = await ownedWebhook(webhookId)
    await prisma.webhook.update({ where: { id: webhookId }, data: { isActive } })
    revalidate(hook.formId)
    return ok({ isActive })
  } catch (e) {
    return fail(e)
  }
}

export async function rotateWebhookSecret(webhookId: string): Promise<ActionResult<{ secret: string }>> {
  try {
    const hook = await ownedWebhook(webhookId)
    const secret = newSecret()
    await prisma.webhook.update({ where: { id: webhookId }, data: { secret } })
    revalidate(hook.formId)
    return ok({ secret })
  } catch (e) {
    return fail(e)
  }
}

export async function deleteWebhook(webhookId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { hook } = await accessibleWebhook(webhookId)
    await prisma.webhook.delete({ where: { id: webhookId } })
    revalidate(hook.formId)
    return ok({ id: webhookId })
  } catch (e) {
    return fail(e)
  }
}

function sampleFor(field: FormField): unknown {
  switch (field.type) {
    case "email":
      return "jane@example.com"
    case "number":
    case "rating":
    case "scale":
      return 4
    case "phone":
      return "+1 555 010 2030"
    case "url":
      return "https://example.com"
    case "date":
      return new Date().toISOString().slice(0, 10)
    case "time":
      return "10:30"
    case "yes_no":
    case "consent":
      return true
    case "checkboxes":
    case "multi_select":
      return (field.options ?? []).slice(0, 2).map((o) => o.value)
    case "select":
    case "radio":
    case "image_choice":
      return field.options?.[0]?.value ?? "option"
    case "file":
      return { name: "example.pdf", type: "application/pdf", size: 12034 }
    case "signature":
      return "[signature]"
    default:
      return `Sample ${field.label.toLowerCase()}`
  }
}

export async function sendTestWebhook(webhookId: string): Promise<ActionResult<{ success: boolean; statusCode: number | null; error: string | null }>> {
  try {
    const hook = await ownedWebhook(webhookId)
    const form = await prisma.form.findUniqueOrThrow({ where: { id: hook.formId } })
    const schema = normalizeSchema(form.publishedSchema ?? form.draftSchema)
    const data = Object.fromEntries(schema.fields.filter(isInputField).filter((f) => f.type !== "password").map((f) => [f.key, sampleFor(f)]))
    const delivery = await deliverWebhook(hook, "webhook.test", {
      event: "webhook.test",
      test: true,
      createdAt: new Date().toISOString(),
      form: { id: form.id, title: form.title, slug: form.slug },
      submission: { id: "sub_test_" + randomBytes(4).toString("hex"), score: null, data },
    })
    revalidate(hook.formId)
    return ok({ success: delivery.success, statusCode: delivery.statusCode, error: delivery.error })
  } catch (e) {
    return fail(e)
  }
}

export async function retryDelivery(deliveryId: string): Promise<ActionResult<{ success: boolean; statusCode: number | null; error: string | null }>> {
  try {
    const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } })
    if (!delivery) throw new Error("Delivery not found")
    const hook = await ownedWebhook(delivery.webhookId)
    const next = await deliverWebhook(hook, delivery.event, delivery.payload as Record<string, unknown>, delivery.attempt + 1)
    revalidate(hook.formId)
    return ok({ success: next.success, statusCode: next.statusCode, error: next.error })
  } catch (e) {
    return fail(e)
  }
}
