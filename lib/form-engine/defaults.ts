import type {
  AutoReplySettings,
  CustomFont,
  FormMode,
  FormSchema,
  FormSettings,
  PublicFormSettings,
  ThemeConfig,
} from "./types"
import { googleWeightSpec } from "../fonts/google-fonts"
import { FORM_MODES } from "./types"

export const FONT_GROUPS: { label: string; fonts: string[] }[] = [
  {
    label: "Sans serif",
    fonts: [
      "Inter",
      "Geist",
      "DM Sans",
      "Manrope",
      "Plus Jakarta Sans",
      "IBM Plex Sans",
      "Work Sans",
      "Instrument Sans",
      "Figtree",
      "Outfit",
      "Onest",
      "Hanken Grotesk",
      "Public Sans",
      "Nunito Sans",
      "Poppins",
      "Montserrat",
      "Lato",
      "Open Sans",
      "Roboto",
      "Source Sans 3",
      "Mukta",
      "Hind",
      "Noto Sans",
    ],
  },
  { label: "Display", fonts: ["Space Grotesk", "Sora", "Bricolage Grotesque", "Syne", "Archivo", "Unbounded"] },
  { label: "Serif", fonts: ["Source Serif 4", "Fraunces", "Lora", "Merriweather", "Playfair Display", "Newsreader", "Libre Baskerville", "EB Garamond", "Instrument Serif", "DM Serif Display"] },
  { label: "Monospace", fonts: ["JetBrains Mono", "IBM Plex Mono", "Space Mono", "Geist Mono"] },
]

export const FONT_FAMILIES = FONT_GROUPS.flatMap((g) => g.fonts)

function fontWeightSpec(family: string) {
  return googleWeightSpec(family)
}

/** Font family names are interpolated into CSS and URLs, so only plain names are allowed. */
export const FONT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,47}$/

export function sanitizeFontName(name: unknown, fallback = "Inter"): string {
  if (typeof name !== "string") return fallback
  const n = name.trim().replace(/\s+/g, " ")
  return FONT_NAME_RE.test(n) ? n : fallback
}

export const MAX_CUSTOM_FONTS = 2
export const MAX_CUSTOM_FONT_BYTES = 400 * 1024
const FONT_DATA_RE = /^data:(?:font\/(?:woff2|woff|ttf|otf|sfnt)|application\/(?:font-woff2?|x-font-ttf|x-font-otf|font-sfnt|vnd\.ms-opentype|octet-stream));base64,[A-Za-z0-9+/]+=*$/

export function sanitizeCustomFonts(raw: unknown): CustomFont[] {
  if (!Array.isArray(raw)) return []
  const out: CustomFont[] = []
  for (const f of raw) {
    if (!f || typeof f !== "object") continue
    const r = f as Record<string, unknown>
    const family = sanitizeFontName(r.family, "")
    const dataUrl = typeof r.dataUrl === "string" ? r.dataUrl : ""
    const format = ["woff2", "woff", "truetype", "opentype"].includes(r.format as string) ? (r.format as CustomFont["format"]) : null
    if (!family || !format || !FONT_DATA_RE.test(dataUrl)) continue
    if (dataUrl.length > Math.ceil((MAX_CUSTOM_FONT_BYTES * 4) / 3) + 100) continue
    if (out.some((x) => x.family.toLowerCase() === family.toLowerCase())) continue
    out.push({ family, dataUrl, format })
    if (out.length >= MAX_CUSTOM_FONTS) break
  }
  return out
}

/** @font-face rules for uploaded fonts (inputs already sanitised). */
export function customFontFaces(theme: Pick<ThemeConfig, "customFonts">): string {
  return sanitizeCustomFonts(theme.customFonts)
    .map((f) => `@font-face{font-family:"${f.family}";src:url("${f.dataUrl}") format("${f.format}");font-weight:100 900;font-style:normal;font-display:swap}`)
    .join("")
}

export const THEME_PRESETS: ThemeConfig[] = [
  {
    preset: "studio",
    fontFamily: "IBM Plex Sans",
    headingSize: 28,
    bodySize: 15,
    colors: {
      primary: "#2849c7",
      primaryText: "#ffffff",
      background: "#f6f3ec",
      surface: "#fffdf9",
      text: "#1b2233",
      muted: "#6b6559",
      border: "#e5dfd3",
      error: "#c42b1c",
    },
    maxWidth: 680,
    radius: 10,
    density: "comfortable",
    buttonText: "Submit",
    customCss: "",
  },
  {
    preset: "harbor",
    fontFamily: "DM Sans",
    headingSize: 28,
    bodySize: 15,
    colors: {
      primary: "#2563eb",
      primaryText: "#ffffff",
      background: "#f3f6fb",
      surface: "#ffffff",
      text: "#0f172a",
      muted: "#64748b",
      border: "#dbe3ef",
      error: "#dc2626",
    },
    maxWidth: 680,
    radius: 12,
    density: "comfortable",
    buttonText: "Submit",
    customCss: "",
  },
  {
    preset: "fern",
    fontFamily: "Manrope",
    headingSize: 28,
    bodySize: 15,
    colors: {
      primary: "#166534",
      primaryText: "#ffffff",
      background: "#f5f6f1",
      surface: "#ffffff",
      text: "#1c2a1f",
      muted: "#5f6f62",
      border: "#dfe4d8",
      error: "#b91c1c",
    },
    maxWidth: 660,
    radius: 8,
    density: "comfortable",
    buttonText: "Send",
    customCss: "",
  },
  {
    preset: "terracotta",
    fontFamily: "Source Serif 4",
    headingFont: "Fraunces",
    headingSize: 32,
    bodySize: 16,
    colors: {
      primary: "#9a3412",
      primaryText: "#fff7ed",
      background: "#faf6f0",
      surface: "#fffdf9",
      text: "#2b1d14",
      muted: "#7c6a5c",
      border: "#eadfd2",
      error: "#b91c1c",
    },
    maxWidth: 640,
    radius: 6,
    density: "spacious",
    buttonText: "Submit",
    customCss: "",
  },
  {
    preset: "midnight",
    fontFamily: "Geist",
    headingSize: 28,
    bodySize: 15,
    colors: {
      primary: "#e4e4e7",
      primaryText: "#09090b",
      background: "#09090b",
      surface: "#131316",
      text: "#f4f4f5",
      muted: "#a1a1aa",
      border: "#27272a",
      error: "#f87171",
    },
    maxWidth: 680,
    radius: 10,
    density: "comfortable",
    buttonText: "Submit",
    customCss: "",
  },
  {
    preset: "mono",
    fontFamily: "JetBrains Mono",
    headingSize: 24,
    bodySize: 14,
    colors: {
      primary: "#111111",
      primaryText: "#ffffff",
      background: "#ffffff",
      surface: "#ffffff",
      text: "#111111",
      muted: "#6b6b6b",
      border: "#d4d4d4",
      error: "#d00000",
    },
    maxWidth: 620,
    radius: 0,
    density: "compact",
    buttonText: "Submit →",
    customCss: "",
  },
]

export const PRESET_LABELS: Record<string, string> = {
  studio: "Digital Fueled",
  harbor: "Harbor",
  fern: "Fern",
  terracotta: "Terracotta",
  midnight: "Midnight",
  mono: "Mono",
}

export function defaultTheme(preset = "studio"): ThemeConfig {
  const found = THEME_PRESETS.find((p) => p.preset === preset) ?? THEME_PRESETS[0]
  return structuredClone(found)
}

export function defaultSchema(): FormSchema {
  return {
    version: 1,
    fields: [],
    logic: [],
    quiz: { showLiveScore: false, revealScore: true, outcomes: [] },
    stepper: {
      progressStyle: "bar",
      showStepTitles: true,
      nextLabel: "Next",
      backLabel: "Back",
    },
    logicLayout: {},
  }
}

export function defaultAutoReply(): AutoReplySettings {
  return {
    enabled: false,
    subject: "Thanks — we received your response to {{form_title}}",
    heading: "Thank you for your response",
    body: "Hi,\n\nThanks for taking the time to complete {{form_title}}. We have received your answers and will get back to you shortly.\n\nYour reference is {{submission_id}}.",
    includeAnswers: true,
    fromName: "",
    replyTo: "",
  }
}

export function defaultSettings(): FormSettings {
  return {
    successTitle: "Thank you!",
    successMessage: "Your response has been recorded.",
    ctaLabel: "",
    ctaUrl: "",
    redirectEnabled: false,
    redirectUrl: "",
    redirectDelay: 3,
    forwardParams: false,
    showReceipt: true,
    opensAt: null,
    closesAt: null,
    maxSubmissions: null,
    closedMessage: "This form is no longer accepting responses.",
    passwordEnabled: false,
    passwordHash: null,
    allowedDomains: [],
    honeypot: true,
    minSubmitSeconds: 2,
    notifyEmails: [],
    respondentEmailFieldId: null,
    autoReply: defaultAutoReply(),
    webhooksEnabled: true,
    hideBadge: false,
    saveAndResume: false,
    resumeTtlDays: 14,
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Safely normalizes a JSON column into a complete FormSchema. */
export function normalizeSchema(raw: unknown): FormSchema {
  const base = defaultSchema()
  if (!isObject(raw)) return base
  return {
    version: 1,
    fields: Array.isArray(raw.fields) ? (raw.fields as FormSchema["fields"]) : [],
    logic: Array.isArray(raw.logic) ? (raw.logic as FormSchema["logic"]) : [],
    quiz: { ...base.quiz, ...(isObject(raw.quiz) ? (raw.quiz as Partial<FormSchema["quiz"]>) : {}) },
    stepper: {
      ...base.stepper,
      ...(isObject(raw.stepper) ? (raw.stepper as Partial<FormSchema["stepper"]>) : {}),
    },
    logicLayout: isObject(raw.logicLayout)
      ? (raw.logicLayout as FormSchema["logicLayout"])
      : {},
  }
}

export function normalizeTheme(raw: unknown): ThemeConfig {
  const presetName = isObject(raw) && typeof raw.preset === "string" ? raw.preset : "studio"
  const base = defaultTheme(presetName)
  if (!isObject(raw)) return base
  const merged: ThemeConfig = {
    ...base,
    ...(raw as Partial<ThemeConfig>),
    colors: { ...base.colors, ...(isObject(raw.colors) ? (raw.colors as Partial<ThemeConfig["colors"]>) : {}) },
  }
  merged.fontFamily = sanitizeFontName(merged.fontFamily, base.fontFamily)
  merged.headingFont = merged.headingFont ? sanitizeFontName(merged.headingFont, "") || undefined : undefined
  merged.customFonts = sanitizeCustomFonts(merged.customFonts)
  return merged
}

export function normalizeSettings(raw: unknown): FormSettings {
  const base = defaultSettings()
  if (!isObject(raw)) return base
  return {
    ...base,
    ...(raw as Partial<FormSettings>),
    allowedDomains: Array.isArray(raw.allowedDomains) ? (raw.allowedDomains as string[]) : [],
    notifyEmails: Array.isArray(raw.notifyEmails) ? (raw.notifyEmails as string[]) : [],
    autoReply: normalizeAutoReply(raw.autoReply, typeof raw.respondentEmailFieldId === "string" && !!raw.respondentEmailFieldId),
  }
}

function normalizeAutoReply(raw: unknown, legacyEnabled: boolean): AutoReplySettings {
  const base = defaultAutoReply()
  // Forms saved before auto-replies existed sent a receipt whenever a recipient field was picked.
  if (!isObject(raw)) return { ...base, enabled: legacyEnabled }
  const str = (v: unknown, fallback: string, max: number) => (typeof v === "string" ? v.slice(0, max) : fallback)
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : legacyEnabled,
    subject: str(raw.subject, base.subject, 200),
    heading: str(raw.heading, base.heading, 200),
    body: str(raw.body, base.body, 5000),
    includeAnswers: typeof raw.includeAnswers === "boolean" ? raw.includeAnswers : base.includeAnswers,
    fromName: str(raw.fromName, "", 80).replace(/[<>"\r\n]/g, ""),
    replyTo: str(raw.replyTo, "", 200).trim(),
  }
}

export function toPublicSettings(settings: FormSettings): PublicFormSettings {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, notifyEmails, autoReply, ...rest } = settings
  return rest
}

export function normalizeMode(raw: unknown): FormMode {
  return FORM_MODES.includes(raw as FormMode) ? (raw as FormMode) : "CLASSIC"
}

export function googleFontsHref(theme: Pick<ThemeConfig, "fontFamily" | "headingFont" | "customFonts">) {
  const uploaded = new Set((theme.customFonts ?? []).map((f) => f.family.toLowerCase()))
  const families = Array.from(new Set([theme.fontFamily, theme.headingFont].filter(Boolean)))
    .map((f) => sanitizeFontName(f, ""))
    .filter((f) => f && !uploaded.has(f.toLowerCase()))
  if (families.length === 0) return null
  const q = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}${fontWeightSpec(f)}`)
    .join("&")
  return `https://fonts.googleapis.com/css2?${q}&display=swap`
}

/** One stylesheet that renders each curated family name in its own typeface (glyph-subset via `text=`). */
export function fontPreviewHref(families: string[] = FONT_FAMILIES) {
  const names = families.map((f) => sanitizeFontName(f, "")).filter(Boolean)
  const text = Array.from(new Set(names.join("").split(""))).join("")
  const q = names.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`).join("&")
  return `https://fonts.googleapis.com/css2?${q}&text=${encodeURIComponent(text)}&display=swap`
}
