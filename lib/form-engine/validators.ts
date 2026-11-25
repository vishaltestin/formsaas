import { isPossiblePhoneNumber, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js"

import { countryByCode } from "./countries"
import type { FieldProps, TextFormat } from "./types"

/* ───────────── Identity & postal formats ───────────── */

// Verhoeff tables (Aadhaar check digit)
const V_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const V_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 1, 3, 5, 8, 6, 2, 7, 0, 9],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

export function verhoeffValid(num: string) {
  if (!/^\d+$/.test(num)) return false
  let c = 0
  const digits = num.split("").reverse().map(Number)
  for (let i = 0; i < digits.length; i++) c = V_D[c][V_P[i % 8][digits[i]]]
  return c === 0
}

export function aadhaarValid(raw: string) {
  const s = raw.replace(/[\s-]/g, "")
  return /^[2-9]\d{11}$/.test(s) && verhoeffValid(s)
}

export function panValid(raw: string) {
  return /^[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z]$/.test(raw.trim().toUpperCase())
}

const GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
export function gstinValid(raw: string) {
  const s = raw.trim().toUpperCase()
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const v = GST_CHARS.indexOf(s[i]) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(v / 36) + (v % 36)
  }
  const check = GST_CHARS[(36 - (sum % 36)) % 36]
  return check === s[14]
}

export function ifscValid(raw: string) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(raw.trim().toUpperCase())
}

export function ibanValid(raw: string) {
  const s = raw.replace(/\s+/g, "").toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false
  const rearranged = s.slice(4) + s.slice(0, 4)
  let rem = 0
  for (const ch of rearranged) {
    const n = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of n) rem = (rem * 10 + Number(d)) % 97
  }
  return rem === 1
}

export const FORMAT_RULES: Record<Exclude<TextFormat, "none">, { label: string; test: (v: string) => boolean; message: string; example?: string }> = {
  email: { label: "Email", test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), message: "Enter a valid email" },
  url: { label: "URL", test: (v) => /^https?:\/\/\S+\.\S+/.test(v), message: "Enter a valid URL" },
  phone: { label: "Phone", test: (v) => /^\+?[0-9\s().-]{7,20}$/.test(v) && digitCount(v) >= 7 && digitCount(v) <= 15, message: "Enter a valid phone number" },
  alphanumeric: { label: "Letters & numbers", test: (v) => /^[a-z0-9]+$/i.test(v), message: "Only letters and numbers" },
  pan: { label: "PAN (India)", test: panValid, message: "Enter a valid PAN, e.g. ABCPE1234F", example: "ABCPE1234F" },
  gstin: { label: "GSTIN (India)", test: gstinValid, message: "Enter a valid 15-character GSTIN", example: "27AAPFU0939F1ZV" },
  aadhaar: { label: "Aadhaar (India)", test: aadhaarValid, message: "Enter a valid 12-digit Aadhaar number", example: "2345 6789 0124" },
  ifsc: { label: "IFSC (India)", test: ifscValid, message: "Enter a valid IFSC, e.g. HDFC0001234", example: "HDFC0001234" },
  pincode_in: { label: "PIN code (India)", test: (v) => /^[1-9]\d{5}$/.test(v.replace(/\s/g, "")), message: "Enter a valid 6-digit PIN code", example: "110001" },
  zip_us: { label: "ZIP code (US)", test: (v) => /^\d{5}(-\d{4})?$/.test(v.trim()), message: "Enter a valid ZIP code", example: "94105" },
  postcode_uk: { label: "Postcode (UK)", test: (v) => /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(v.trim()), message: "Enter a valid UK postcode", example: "SW1A 1AA" },
  iban: { label: "IBAN", test: ibanValid, message: "Enter a valid IBAN", example: "GB82 WEST 1234 5698 7654 32" },
}

/* ───────────── Email ───────────── */

export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk", "ymail.com", "rocketmail.com",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net", "gmx.de", "mail.com", "yandex.com",
  "yandex.ru", "zoho.com", "zohomail.in", "rediffmail.com", "tutanota.com", "fastmail.com", "hey.com", "qq.com",
  "163.com", "126.com", "web.de", "inbox.com", "mail.ru",
])

export function isFreeEmail(email: string) {
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? ""
  return FREE_EMAIL_DOMAINS.has(domain)
}

/* ───────────── Phone ───────────── */

export function digitCount(v: string) {
  return v.replace(/\D/g, "").length
}

/** Splits a stored phone value (`+91 98765 43210`) into dialling code and national number. */
export function splitPhone(value: string, defaultCountry = "IN"): { country: string; national: string } {
  const v = value.trim()
  if (v.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(v)
    if (parsed?.country) return { country: parsed.country, national: v.slice(parsed.countryCallingCode.length + 1).trim() }
    const m = v.match(/^\+(\d{1,4})\s*(.*)$/)
    if (m) {
      const fallback = countryByCode(defaultCountry)
      if (fallback && fallback[2] === m[1]) return { country: defaultCountry, national: m[2] }
      return { country: defaultCountry, national: m[2] }
    }
  }
  return { country: defaultCountry, national: v }
}

export function joinPhone(country: string, national: string) {
  const dial = countryByCode(country)?.[2]
  const n = national.trim()
  if (!n) return ""
  return dial ? `+${dial} ${n}` : n
}

export function phoneValid(value: string, withCountryCode: boolean) {
  const v = value.trim()
  if (!/^\+?[0-9\s().-]{4,24}$/.test(v)) return false
  if (withCountryCode) {
    if (!v.startsWith("+")) return false
    try {
      return isPossiblePhoneNumber(v)
    } catch {
      return false
    }
  }
  const d = digitCount(v)
  return d >= 7 && d <= 15
}

export function isCountryCode(code: string): code is CountryCode {
  return !!countryByCode(code)
}

/* ───────────── Dates ───────────── */

export function ageOn(dobIso: string, todayIso: string) {
  const [y, m, d] = dobIso.split("-").map(Number)
  const [ty, tm, td] = todayIso.split("-").map(Number)
  let age = ty - y
  if (tm < m || (tm === m && td < d)) age--
  return age
}

export function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function weekdayOf(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay()
}

/* ───────────── Appointments ───────────── */

export const APPOINTMENT_DEFAULTS = { slotStart: "09:00", slotEnd: "17:00", slotMinutes: 30, daysAhead: 30, weekdays: [1, 2, 3, 4, 5] }

function toMinutes(t: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(t)
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

export function appointmentSlots(props: FieldProps | undefined): string[] {
  const start = toMinutes(props?.slotStart ?? APPOINTMENT_DEFAULTS.slotStart)
  const end = toMinutes(props?.slotEnd ?? APPOINTMENT_DEFAULTS.slotEnd)
  const step = Math.max(5, Math.min(240, Math.round(props?.slotMinutes ?? APPOINTMENT_DEFAULTS.slotMinutes)))
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
  const out: string[] = []
  for (let t = start; t + step <= end && out.length < 200; t += step)
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`)
  return out
}

export function appointmentDates(props: FieldProps | undefined, todayIso: string): string[] {
  const days = Math.max(1, Math.min(180, Math.round(props?.daysAhead ?? APPOINTMENT_DEFAULTS.daysAhead)))
  const allowed = new Set(props?.weekdays?.length ? props.weekdays : APPOINTMENT_DEFAULTS.weekdays)
  const out: string[] = []
  for (let i = 0; i <= days; i++) {
    const d = addDaysIso(todayIso, i)
    if (allowed.has(weekdayOf(d))) out.push(d)
  }
  return out
}

/* ───────────── Currency ───────────── */

export const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: "INR", symbol: "₹", label: "Indian rupee" },
  { code: "USD", symbol: "$", label: "US dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British pound" },
  { code: "AED", symbol: "AED", label: "UAE dirham" },
  { code: "SGD", symbol: "S$", label: "Singapore dollar" },
  { code: "AUD", symbol: "A$", label: "Australian dollar" },
  { code: "CAD", symbol: "C$", label: "Canadian dollar" },
  { code: "JPY", symbol: "¥", label: "Japanese yen" },
]

export function currencySymbol(code: string | undefined) {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code ?? ""
}

/* ───────────── Video ───────────── */

/** Converts a YouTube / Vimeo / Loom share URL into a privacy-friendly embed URL. */
export function videoEmbedUrl(raw: string | undefined): string | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== "https:") return null
  const host = u.hostname.replace(/^www\./, "")
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0]
    return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1] ?? ""
    return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.match(/(\d{6,12})/)?.[1]
    return id ? `https://player.vimeo.com/video/${id}` : null
  }
  if (host === "loom.com") {
    const id = u.pathname.match(/\/(?:share|embed)\/([a-f0-9]{16,40})/)?.[1]
    return id ? `https://www.loom.com/embed/${id}` : null
  }
  return null
}
