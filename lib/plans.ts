/** Shared plan types & defaults (safe for client and server). */

export interface PlanLimits {
  /** -1 = unlimited */
  maxForms: number
  /** -1 = unlimited */
  monthlySubmissions: number
  maxFileUploadMb: number
}

export interface PlanFeatures {
  customBranding: boolean
  conditionalLogic: boolean
  webhooks: boolean
  customCss: boolean
  removeBadge: boolean
  advancedEmbeds: boolean
  prioritySupport: boolean
}

export const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  customBranding: "Custom branding (logo & cover)",
  conditionalLogic: "Conditional logic & branching",
  webhooks: "Webhooks & integrations",
  customCss: "Custom CSS",
  removeBadge: "Remove Digital Fueled badge",
  advancedEmbeds: "Script, popup & drawer embeds",
  prioritySupport: "Priority support",
}

export const DEFAULT_PLANS: {
  slug: string
  name: string
  description: string
  priceLabel: string
  sortOrder: number
  limits: PlanLimits
  features: PlanFeatures
}[] = [
  {
    slug: "free",
    name: "Free",
    description: "Core fields and basic embeds for personal projects.",
    priceLabel: "$0/mo",
    sortOrder: 0,
    limits: { maxForms: 3, monthlySubmissions: 100, maxFileUploadMb: 2 },
    features: {
      customBranding: false,
      conditionalLogic: false,
      webhooks: false,
      customCss: false,
      removeBadge: false,
      advancedEmbeds: false,
      prioritySupport: false,
    },
  },
  {
    slug: "pro",
    name: "Pro",
    description: "Logic, webhooks and every embed type for growing teams.",
    priceLabel: "$29/mo",
    sortOrder: 1,
    limits: { maxForms: 25, monthlySubmissions: 5000, maxFileUploadMb: 10 },
    features: {
      customBranding: true,
      conditionalLogic: true,
      webhooks: true,
      customCss: false,
      removeBadge: true,
      advancedEmbeds: true,
      prioritySupport: false,
    },
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description: "Unlimited scale, custom CSS and priority support.",
    priceLabel: "Custom",
    sortOrder: 2,
    limits: { maxForms: -1, monthlySubmissions: -1, maxFileUploadMb: 25 },
    features: {
      customBranding: true,
      conditionalLogic: true,
      webhooks: true,
      customCss: true,
      removeBadge: true,
      advancedEmbeds: true,
      prioritySupport: true,
    },
  },
]

export function normalizeLimits(raw: unknown): PlanLimits {
  const base = DEFAULT_PLANS[0].limits
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PlanLimits>
  return {
    maxForms: Number.isFinite(r.maxForms) ? Number(r.maxForms) : base.maxForms,
    monthlySubmissions: Number.isFinite(r.monthlySubmissions) ? Number(r.monthlySubmissions) : base.monthlySubmissions,
    maxFileUploadMb: Number.isFinite(r.maxFileUploadMb) ? Number(r.maxFileUploadMb) : base.maxFileUploadMb,
  }
}

export function normalizeFeatures(raw: unknown): PlanFeatures {
  const base = DEFAULT_PLANS[0].features
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PlanFeatures>
  const out = { ...base }
  for (const k of Object.keys(base) as (keyof PlanFeatures)[]) out[k] = !!r[k]
  return out
}

export function formatLimit(n: number) {
  return n < 0 ? "Unlimited" : n.toLocaleString("en-US")
}

export const SETTING_KEYS = [
  "ownerName",
  "ownerEmail",
  "ownerPhone",
  "ownerWhatsApp",
  "ownerBookingUrl",
] as const
export type SettingKey = (typeof SETTING_KEYS)[number]
export type OwnerContact = Record<SettingKey, string>

export const DEFAULT_OWNER_CONTACT: OwnerContact = {
  ownerName: "Digital Fueled Team",
  ownerEmail: "owner@formstudio.dev",
  ownerPhone: "+1 415 555 0134",
  ownerWhatsApp: "+14155550134",
  ownerBookingUrl: "https://cal.com/digitalfueled/upgrade",
}
