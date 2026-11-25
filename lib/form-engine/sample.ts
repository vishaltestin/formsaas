import { addDaysIso, appointmentDates, appointmentSlots } from "./validators"
import type { FormField } from "./types"

const FILLER = "This sample answer was generated to exercise the integration end to end. "

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function sampleText(f: FormField) {
  const v = f.validation ?? {}
  if (v.format === "pan") return "ABCPE1234F"
  if (v.format === "gstin") return "27AAPFU0939F1ZV"
  if (v.format === "aadhaar") return "2345 6789 0124"
  if (v.format === "ifsc") return "HDFC0001234"
  if (v.format === "pincode_in") return "110001"
  if (v.format === "zip_us") return "94105"
  if (v.format === "postcode_uk") return "SW1A 1AA"
  if (v.format === "iban") return "GB82WEST12345698765432"
  if (v.format === "email") return "ada@example.com"
  if (v.format === "url") return "https://example.com"
  if (v.pattern) {
    try {
      const re = new RegExp(v.pattern)
      const hit = ["123456789012", "ABC123", "AB-1234", "sample", "A1", "2026"].find((c) => re.test(c))
      if (hit) return hit
    } catch {
      /* invalid pattern: fall through to plain text */
    }
  }
  let text = /name/i.test(f.label) ? "Ada Lovelace" : f.type === "long_text" ? FILLER.trim() : `Sample ${f.label.toLowerCase()}`.slice(0, 60)
  while (v.minLength && text.length < v.minLength) text += ` ${FILLER.trim()}`
  return v.maxLength ? text.slice(0, v.maxLength) : text
}

function clamp(n: number, min?: number, max?: number) {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
}

/**
 * A realistic value that passes the shared validator for `field`.
 * Used by the API playground and automation test runs.
 */
export function sampleFieldValue(f: FormField): unknown {
  const v = f.validation ?? {}
  const opts = (f.options ?? []).map((o) => o.value)
  switch (f.type) {
    case "email":
      return v.businessEmail ? "ada@northwind.dev" : "ada@example.com"
    case "number":
      return clamp(4, v.min, v.max)
    case "currency":
      return clamp(25000, v.min, v.max)
    case "rating":
      return Math.min(4, f.props?.maxRating ?? 5)
    case "scale":
      return clamp(8, f.props?.scaleMin ?? 0, f.props?.scaleMax ?? 10)
    case "slider": {
      const min = f.props?.scaleMin ?? 0
      const max = f.props?.scaleMax ?? 100
      const step = f.props?.step && f.props.step > 0 ? f.props.step : 1
      return clamp(min + Math.round((max - min) / 2 / step) * step, min, max)
    }
    case "calculated":
      return 0
    case "checkboxes":
    case "multi_select":
      return opts.slice(0, Math.max(1, v.minSelected ?? 1))
    case "ranking":
      return opts
    case "radio":
    case "select":
    case "image_choice":
      return opts[0] ?? "option_1"
    case "yes_no":
    case "consent":
      return true
    case "date": {
      if (typeof v.minAge === "number") return addDaysIso(todayIso(), -366 * (v.minAge + 2))
      if (v.dateRule === "future") return addDaysIso(todayIso(), 7)
      if (v.dateRule === "past") return addDaysIso(todayIso(), -7)
      return v.dateMin ?? todayIso()
    }
    case "time":
      return "09:30"
    case "datetime":
      return `${v.dateRule === "past" ? addDaysIso(todayIso(), -1) : addDaysIso(todayIso(), 1)}T10:30`
    case "date_range": {
      const start = v.dateMin && v.dateMin > todayIso() ? v.dateMin : addDaysIso(todayIso(), 7)
      return { start, end: addDaysIso(start, 3) }
    }
    case "appointment": {
      const date = appointmentDates(f.props, todayIso())[1] ?? appointmentDates(f.props, todayIso())[0] ?? todayIso()
      return { date, time: appointmentSlots(f.props)[0] ?? "09:00" }
    }
    case "phone":
      return f.props?.countryCode ? "+91 98765 43210" : "+1 555 010 0199"
    case "country":
      return typeof f.defaultValue === "string" && /^[A-Z]{2}$/.test(f.defaultValue) ? f.defaultValue : "IN"
    case "full_name":
      return { first: "Ada", last: "Lovelace" }
    case "address":
      return { line1: "12 Barakhamba Road", line2: "", city: "New Delhi", state: "Delhi", postal: "110001", country: "IN" }
    case "color":
      return "#2563eb"
    case "url":
      return "https://example.com"
    case "matrix": {
      const cols = f.props?.matrixColumns ?? []
      return Object.fromEntries((f.props?.matrixRows ?? []).map((r) => [r.id, cols[cols.length - 1]?.id ?? ""]))
    }
    case "file":
    case "signature":
      return null
    default:
      return sampleText(f)
  }
}
