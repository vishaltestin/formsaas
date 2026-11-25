import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import type { Form } from "@/generated/prisma/client"
import { getEffectivePlan } from "@/lib/entitlements"
import {
  normalizeMode,
  normalizeSchema,
  normalizeSettings,
  normalizeTheme,
  toPublicSettings,
  type FormMode,
  type FormSchema,
  type PublicFormSettings,
  type ThemeConfig,
} from "@/lib/form-engine"

export interface PublicFormPayload {
  formId: string
  slug: string
  title: string
  description: string | null
  mode: FormMode
  schema: FormSchema
  theme: ThemeConfig
  settings: PublicFormSettings
  logicEnabled: boolean
  showBadge: boolean
  allowCustomCss: boolean
  allowBranding: boolean
  advancedEmbeds: boolean
  maxUploadMb: number
}

export async function buildPublicPayload(form: Form): Promise<PublicFormPayload> {
  const plan = await getEffectivePlan(form.userId)
  const settings = normalizeSettings(form.settings)
  const schema = normalizeSchema(form.publishedSchema ?? form.draftSchema)
  // Strip internal layout data from the public payload.
  delete schema.logicLayout
  return {
    formId: form.id,
    slug: form.slug,
    title: form.title,
    description: form.description,
    mode: normalizeMode(form.mode),
    schema,
    theme: normalizeTheme(form.themeConfig),
    settings: toPublicSettings(settings),
    logicEnabled: plan.features.conditionalLogic,
    showBadge: !(plan.features.removeBadge && settings.hideBadge),
    allowCustomCss: plan.features.customCss,
    allowBranding: plan.features.customBranding,
    advancedEmbeds: plan.features.advancedEmbeds,
    maxUploadMb: plan.limits.maxFileUploadMb < 0 ? 100 : plan.limits.maxFileUploadMb,
  }
}

function secret() {
  return process.env.AUTH_SECRET || "formstudio-dev-secret"
}

/** Short-lived token proving the respondent unlocked a password-protected form. */
export function signUnlockToken(formId: string, passwordHash: string, ttlSeconds = 60 * 60 * 6) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const body = `${formId}.${exp}`
  const sig = createHmac("sha256", secret()).update(`${body}.${passwordHash.slice(-16)}`).digest("base64url")
  return `${Buffer.from(body).toString("base64url")}.${sig}`
}

export function verifyUnlockToken(token: string | undefined | null, formId: string, passwordHash: string) {
  if (!token) return false
  const [b64, sig] = token.split(".")
  if (!b64 || !sig) return false
  const body = Buffer.from(b64, "base64url").toString()
  const [id, expRaw] = body.split(".")
  if (id !== formId || Number(expRaw) < Date.now() / 1000) return false
  const expected = createHmac("sha256", secret()).update(`${body}.${passwordHash.slice(-16)}`).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function hashIp(ip: string) {
  return createHmac("sha256", secret()).update(ip).digest("hex").slice(0, 32)
}

export function parseUserAgent(ua: string) {
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "mobile" : "desktop"
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /chrome|crios/i.test(ua)
      ? "Chrome"
      : /firefox|fxios/i.test(ua)
        ? "Firefox"
        : /safari/i.test(ua)
          ? "Safari"
          : "Other"
  const os = /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "macOS" : /android/i.test(ua) ? "Android" : /iphone|ipad|ios/i.test(ua) ? "iOS" : /linux/i.test(ua) ? "Linux" : "Other"
  return { device, browser, os }
}

/** DB-backed fixed-window rate limiter shared by all public endpoints. */
export async function rateLimit(key: string, limit: number, windowMs: number) {
  const { hitRateLimit } = await import("@/lib/rate-limit")
  return (await hitRateLimit(`pub:${key}`, limit, windowMs)).allowed
}

export function clientIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "0.0.0.0"
  )
}
