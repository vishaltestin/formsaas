"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { getEffectivePlan } from "@/lib/entitlements"
import { escapeHtml, sendEmail } from "@/lib/notify"
import { prisma } from "@/lib/prisma"
import { assertAdmin, assertUser } from "@/lib/session"
import { getOwnerContact } from "@/lib/entitlements"
import { INTERFACE_FONT_KEY } from "@/lib/appearance"
import { INTERFACE_FONT_IDS, type InterfaceFont } from "@/lib/appearance-shared"

const DAY = 86400000

/* ───────────────────────── user side ───────────────────────── */

const upgradeSchema = z.object({
  planId: z.string().min(1, "Choose a plan"),
  contactEmail: z.string().trim().email("Enter a valid email"),
  contactPhone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+0-9 ()-]*$/, "Use digits, spaces and + ( ) - only")
    .optional()
    .or(z.literal("")),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
})
export type UpgradeInput = z.input<typeof upgradeSchema>

export async function createUpgradeRequest(input: UpgradeInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertUser()
    const data = upgradeSchema.parse(input)
    const plan = await prisma.plan.findUnique({ where: { id: data.planId } })
    if (!plan || !plan.isActive) throw new Error("That plan is not available")
    const current = await getEffectivePlan(user.id)
    if (current.plan.id === plan.id && current.subscription.status === "ACTIVE") throw new Error(`You're already on ${plan.name}`)
    const pending = await prisma.upgradeRequest.findFirst({ where: { userId: user.id, status: "PENDING" } })
    if (pending) throw new Error("You already have a pending request — we’ll be in touch shortly")

    const req = await prisma.upgradeRequest.create({
      data: {
        userId: user.id,
        requestedPlanId: plan.id,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone || null,
        message: data.message || null,
      },
    })
    const owner = await getOwnerContact()
    void sendEmail({
      to: [owner.ownerEmail],
      subject: `Upgrade request: ${user.email} → ${plan.name}`,
      html: `<p><strong>${escapeHtml(user.email ?? "")}</strong> requested <strong>${escapeHtml(plan.name)}</strong>.</p><p>Contact: ${escapeHtml(data.contactEmail)} ${escapeHtml(data.contactPhone ?? "")}</p><p>${escapeHtml(data.message ?? "")}</p>`,
      replyTo: data.contactEmail,
      source: `billing:${req.id}`,
    }).catch(() => undefined)
    revalidatePath("/dashboard/billing")
    revalidatePath("/admin", "layout")
    return ok({ id: req.id })
  } catch (e) {
    return fail(e)
  }
}

export async function cancelUpgradeRequest(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertUser()
    const res = await prisma.upgradeRequest.deleteMany({ where: { id, userId: user.id, status: "PENDING" } })
    if (!res.count) throw new Error("This request can no longer be withdrawn")
    revalidatePath("/dashboard/billing")
    revalidatePath("/admin", "layout")
    return ok({ id })
  } catch (e) {
    return fail(e)
  }
}

/* ───────────────────────── admin side ───────────────────────── */

const assignSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  expiresAt: z.string().datetime().nullable(),
  adminNotes: z.string().trim().max(2000).optional().default(""),
})
export type AssignInput = z.input<typeof assignSchema>

export async function assignPlan(input: AssignInput): Promise<ActionResult<{ userId: string }>> {
  try {
    const admin = await assertAdmin()
    const data = assignSchema.parse(input)
    const [target, plan] = await Promise.all([
      prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } }),
      prisma.plan.findUnique({ where: { id: data.planId } }),
    ])
    if (!target) throw new Error("User not found")
    if (!plan) throw new Error("Plan not found")
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null
    if (expiresAt && expiresAt.getTime() < Date.now()) throw new Error("Expiry must be in the future")
    await prisma.subscription.upsert({
      where: { userId: data.userId },
      create: {
        userId: data.userId,
        planId: plan.id,
        status: "ACTIVE",
        assignedByAdminId: admin.id,
        expiresAt,
        adminNotes: data.adminNotes || null,
      },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        assignedByAdminId: admin.id,
        startsAt: new Date(),
        expiresAt,
        adminNotes: data.adminNotes || null,
      },
    })
    revalidatePath("/admin", "layout")
    return ok({ userId: data.userId })
  } catch (e) {
    return fail(e)
  }
}

export async function revokeSubscription(userId: string): Promise<ActionResult<{ userId: string }>> {
  try {
    const admin = await assertAdmin()
    const res = await prisma.subscription.updateMany({
      where: { userId },
      data: { status: "EXPIRED", expiresAt: new Date(), assignedByAdminId: admin.id },
    })
    if (!res.count) throw new Error("User has no subscription")
    revalidatePath("/admin", "layout")
    return ok({ userId })
  } catch (e) {
    return fail(e)
  }
}

export async function setUserRole(userId: string, role: "USER" | "ADMIN"): Promise<ActionResult<{ role: string }>> {
  try {
    const admin = await assertAdmin()
    if (userId === admin.id && role !== "ADMIN") throw new Error("You can’t remove your own admin access")
    await prisma.user.update({ where: { id: userId }, data: { role: z.enum(["USER", "ADMIN"]).parse(role) } })
    revalidatePath("/admin", "layout")
    return ok({ role })
  } catch (e) {
    return fail(e)
  }
}

const decideSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVED", "DECLINED"]),
  adminResponse: z.string().trim().max(2000).optional().default(""),
  durationDays: z.number().int().min(0).max(3650).nullable().optional(),
})
export type DecideInput = z.input<typeof decideSchema>

/**
 * Atomically resolves a PENDING request. The conditional updateMany acts as a
 * compare-and-set so two admins can't both approve/decline the same request.
 */
export async function decideUpgradeRequest(input: DecideInput): Promise<ActionResult<{ status: string }>> {
  try {
    const admin = await assertAdmin()
    const data = decideSchema.parse(input)
    await prisma.$transaction(async (tx) => {
      const req = await tx.upgradeRequest.findUnique({ where: { id: data.requestId } })
      if (!req) throw new Error("Request not found")
      const claimed = await tx.upgradeRequest.updateMany({
        where: { id: req.id, status: "PENDING" },
        data: { status: data.decision, adminResponse: data.adminResponse || null },
      })
      if (claimed.count !== 1) throw new Error("This request was already handled by another admin")
      if (data.decision === "APPROVED") {
        const expiresAt = data.durationDays ? new Date(Date.now() + data.durationDays * DAY) : null
        const note = `Approved upgrade request ${req.id}${data.adminResponse ? ` — ${data.adminResponse}` : ""}`
        await tx.subscription.upsert({
          where: { userId: req.userId },
          create: { userId: req.userId, planId: req.requestedPlanId, status: "ACTIVE", assignedByAdminId: admin.id, expiresAt, adminNotes: note },
          update: { planId: req.requestedPlanId, status: "ACTIVE", assignedByAdminId: admin.id, startsAt: new Date(), expiresAt, adminNotes: note },
        })
      }
    })
    revalidatePath("/admin", "layout")
    revalidatePath("/dashboard/billing")
    return ok({ status: data.decision })
  } catch (e) {
    return fail(e)
  }
}

const planSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(300).optional().default(""),
  priceLabel: z.string().trim().min(1).max(30),
  isActive: z.boolean(),
  limits: z.object({
    maxForms: z.number().int().min(-1).max(100000),
    monthlySubmissions: z.number().int().min(-1).max(100000000),
    maxFileUploadMb: z.number().int().min(1).max(100),
  }),
  features: z.object({
    customBranding: z.boolean(),
    conditionalLogic: z.boolean(),
    webhooks: z.boolean(),
    customCss: z.boolean(),
    removeBadge: z.boolean(),
    advancedEmbeds: z.boolean(),
    prioritySupport: z.boolean(),
  }),
})
export type PlanInput = z.input<typeof planSchema>

export async function updatePlan(input: PlanInput): Promise<ActionResult<{ id: string }>> {
  try {
    await assertAdmin()
    const data = planSchema.parse(input)
    const plan = await prisma.plan.findUnique({ where: { id: data.id } })
    if (!plan) throw new Error("Plan not found")
    if (plan.slug === "free" && !data.isActive) throw new Error("The Free plan is the fallback and can’t be disabled")
    await prisma.plan.update({
      where: { id: data.id },
      data: {
        name: data.name,
        description: data.description || null,
        priceLabel: data.priceLabel,
        isActive: data.isActive,
        limits: data.limits,
        features: data.features,
      },
    })
    revalidatePath("/admin", "layout")
    revalidatePath("/dashboard", "layout")
    revalidatePath("/")
    return ok({ id: data.id })
  } catch (e) {
    return fail(e)
  }
}

const contactSchema = z.object({
  ownerName: z.string().trim().min(1, "Name is required").max(80),
  ownerEmail: z.string().trim().email("Enter a valid email"),
  ownerPhone: z.string().trim().max(32).regex(/^[+0-9 ()-]*$/, "Invalid phone number"),
  ownerWhatsApp: z.string().trim().max(32).regex(/^\+?[0-9]*$/, "Digits only, optionally starting with +"),
  ownerBookingUrl: z.string().trim().url("Enter a valid URL").or(z.literal("")),
})
export type ContactInput = z.input<typeof contactSchema>

export async function updateOwnerContact(input: ContactInput): Promise<ActionResult<{ saved: true }>> {
  try {
    await assertAdmin()
    const data = contactSchema.parse(input)
    await prisma.$transaction(
      Object.entries(data).map(([key, value]) =>
        prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
      )
    )
    revalidatePath("/admin/settings")
    revalidatePath("/dashboard/billing")
    return ok({ saved: true })
  } catch (e) {
    return fail(e)
  }
}

const interfaceFontSchema = z.object({ font: z.enum(INTERFACE_FONT_IDS as [InterfaceFont, ...InterfaceFont[]]) })

export async function updateInterfaceFont(input: { font: string }): Promise<ActionResult<{ font: InterfaceFont }>> {
  try {
    await assertAdmin()
    const { font } = interfaceFontSchema.parse(input)
    await prisma.systemSetting.upsert({ where: { key: INTERFACE_FONT_KEY }, create: { key: INTERFACE_FONT_KEY, value: font }, update: { value: font } })
    revalidatePath("/dashboard", "layout")
    revalidatePath("/admin", "layout")
    return ok({ font })
  } catch (e) {
    return fail(e)
  }
}
