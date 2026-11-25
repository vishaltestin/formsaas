import "server-only"

import { prisma } from "@/lib/prisma"
import {
  DEFAULT_OWNER_CONTACT,
  DEFAULT_PLANS,
  SETTING_KEYS,
  normalizeFeatures,
  normalizeLimits,
  type OwnerContact,
  type PlanFeatures,
  type PlanLimits,
} from "@/lib/plans"

export type Capability =
  | "form.create"
  | "submission.create"
  | keyof PlanFeatures

export class EntitlementError extends Error {
  constructor(
    message: string,
    public capability: Capability
  ) {
    super(message)
    this.name = "EntitlementError"
  }
}

export interface UserPlanInfo {
  plan: {
    id: string | null
    slug: string
    name: string
    priceLabel: string
  }
  limits: PlanLimits
  features: PlanFeatures
  subscription: {
    status: "ACTIVE" | "EXPIRED" | "NONE"
    expiresAt: Date | null
  }
  usage: {
    forms: number
    monthlySubmissions: number
  }
}

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

async function freePlan() {
  const plan = await prisma.plan.findUnique({ where: { slug: "free" } })
  const fallback = DEFAULT_PLANS[0]
  return {
    plan: plan
      ? { id: plan.id, slug: plan.slug, name: plan.name, priceLabel: plan.priceLabel }
      : { id: null, slug: fallback.slug, name: fallback.name, priceLabel: fallback.priceLabel },
    limits: plan ? normalizeLimits(plan.limits) : fallback.limits,
    features: plan ? normalizeFeatures(plan.features) : fallback.features,
  }
}

/** Resolves the effective plan (expired/missing subscriptions fall back to Free). */
export async function getEffectivePlan(userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  })
  const now = new Date()
  const expired = !!sub && (sub.status === "EXPIRED" || (sub.expiresAt !== null && sub.expiresAt < now))
  if (sub && !expired && sub.plan.isActive) {
    return {
      plan: { id: sub.plan.id, slug: sub.plan.slug, name: sub.plan.name, priceLabel: sub.plan.priceLabel },
      limits: normalizeLimits(sub.plan.limits),
      features: normalizeFeatures(sub.plan.features),
      subscription: { status: "ACTIVE" as const, expiresAt: sub.expiresAt },
    }
  }
  const free = await freePlan()
  return {
    ...free,
    subscription: { status: sub ? ("EXPIRED" as const) : ("NONE" as const), expiresAt: sub?.expiresAt ?? null },
  }
}

export async function getUsage(userId: string) {
  const [forms, monthlySubmissions] = await Promise.all([
    prisma.form.count({ where: { userId } }),
    prisma.submission.count({
      where: { form: { userId }, createdAt: { gte: startOfMonth() } },
    }),
  ])
  return { forms, monthlySubmissions }
}

export async function getUserPlanInfo(userId: string): Promise<UserPlanInfo> {
  const [plan, usage] = await Promise.all([getEffectivePlan(userId), getUsage(userId)])
  return { ...plan, usage }
}

export async function hasCapability(userId: string, capability: Capability) {
  try {
    await assertEntitlement(userId, capability)
    return true
  } catch {
    return false
  }
}

const FEATURE_MESSAGES: Record<keyof PlanFeatures, string> = {
  customBranding: "Custom branding is available on Pro and Enterprise plans.",
  conditionalLogic: "Conditional logic is available on Pro and Enterprise plans.",
  webhooks: "Webhooks are available on Pro and Enterprise plans.",
  customCss: "Custom CSS is available on the Enterprise plan.",
  removeBadge: "Removing the Digital Fueled badge requires a Pro plan.",
  advancedEmbeds: "Script, popup and drawer embeds require a Pro plan.",
  prioritySupport: "Priority support is available on the Enterprise plan.",
}

/**
 * Single server-side entitlement guard. Throws an EntitlementError when the
 * user's effective plan does not allow the capability.
 */
export async function assertEntitlement(userId: string, capability: Capability) {
  const plan = await getEffectivePlan(userId)

  if (capability === "form.create") {
    if (plan.limits.maxForms < 0) return plan
    const count = await prisma.form.count({ where: { userId } })
    if (count >= plan.limits.maxForms)
      throw new EntitlementError(
        `Your ${plan.plan.name} plan allows ${plan.limits.maxForms} forms. Upgrade to create more.`,
        capability
      )
    return plan
  }

  if (capability === "submission.create") {
    if (plan.limits.monthlySubmissions < 0) return plan
    const count = await prisma.submission.count({
      where: { form: { userId }, createdAt: { gte: startOfMonth() } },
    })
    if (count >= plan.limits.monthlySubmissions)
      throw new EntitlementError(
        "This form has reached its monthly response limit.",
        capability
      )
    return plan
  }

  if (!plan.features[capability])
    throw new EntitlementError(FEATURE_MESSAGES[capability], capability)
  return plan
}

export async function getOwnerContact(): Promise<OwnerContact> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  })
  const out: OwnerContact = { ...DEFAULT_OWNER_CONTACT }
  for (const r of rows) out[r.key as keyof OwnerContact] = r.value
  return out
}
