import { isInputField } from "./fields"
import { countryName } from "./countries"
import type { FieldValue, FileValue, FormField, FormSchema, FormValues } from "./types"

export function isFileValue(v: unknown): v is FileValue {
  return typeof v === "object" && v !== null && "dataUrl" in v && "name" in v
}

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === "string") return v.trim() === ""
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === "number") return Number.isNaN(v)
  if (typeof v === "object") return Object.keys(v as object).length === 0
  return false
}

/**
 * Composite values (name, address, date range, appointment) count as blank when
 * every user-entered part is empty. Address ignores the pre-selected country.
 */
export function isBlankComposite(field: Pick<FormField, "type">, value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || isFileValue(value)) return false
  if (!["full_name", "address", "date_range", "appointment"].includes(field.type)) return false
  return Object.entries(value as Record<string, unknown>).every(
    ([k, v]) => (field.type === "address" && k === "country") || v === null || v === undefined || (typeof v === "string" && v.trim() === "")
  )
}

/** Human readable representation of an answer. */
export function formatValue(field: FormField, value: FieldValue): string {
  if (isEmptyValue(value)) return ""
  const optLabel = (v: string) => field.options?.find((o) => o.value === v)?.label ?? v
  switch (field.type) {
    case "select":
    case "radio":
    case "image_choice":
      return optLabel(String(value))
    case "multi_select":
    case "checkboxes":
      return Array.isArray(value) ? value.map(optLabel).join(", ") : optLabel(String(value))
    case "yes_no":
      return value === true || value === "true"
        ? field.props?.yesLabel || "Yes"
        : field.props?.noLabel || "No"
    case "consent":
      return value === true || value === "true" ? "Agreed" : "Not agreed"
    case "rating":
      return `${value} / ${field.props?.maxRating ?? 5}`
    case "country":
      return countryName(String(value))
    case "currency": {
      const n = Number(value)
      if (!Number.isFinite(n)) return String(value)
      const code = field.props?.currency || "INR"
      try {
        return new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", { style: "currency", currency: code, maximumFractionDigits: field.props?.decimals ?? 2 }).format(n)
      } catch {
        return `${code} ${n}`
      }
    }
    case "slider":
      return `${field.props?.prefix ?? ""}${value}${field.props?.suffix ?? ""}`
    case "ranking":
      return Array.isArray(value) ? value.map((x, i) => `${i + 1}. ${optLabel(x)}`).join(", ") : String(value)
    case "datetime":
      return typeof value === "string" ? value.replace("T", " ") : String(value)
    case "full_name": {
      if (!isRecordValue(value)) return String(value)
      return ["title", "first", "middle", "last"].map((k) => value[k]?.trim()).filter(Boolean).join(" ")
    }
    case "address": {
      if (!isRecordValue(value)) return String(value)
      if (isBlankComposite(field, value)) return ""
      const cityLine = [value.city, value.state].map((x) => x?.trim()).filter(Boolean).join(", ")
      return [value.line1, value.line2, [cityLine, value.postal?.trim()].filter(Boolean).join(" "), countryName(value.country)]
        .map((x) => x?.trim())
        .filter(Boolean)
        .join(", ")
    }
    case "date_range":
      return isRecordValue(value) ? `${value.start ?? ""} → ${value.end ?? ""}` : String(value)
    case "appointment":
      return isRecordValue(value) ? `${value.date ?? ""} at ${value.time ?? ""}` : String(value)
    case "file":
      return isFileValue(value) ? `${value.name} (${Math.round(value.size / 1024)} KB)` : String(value)
    case "signature":
      return typeof value === "string" && value.startsWith("data:") ? "Signed" : ""
    case "password":
      return "••••••••"
    case "calculated": {
      const n = Number(value)
      if (!Number.isFinite(n)) return String(value)
      const d = field.props?.decimals ?? 2
      const s = n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
      return `${field.props?.prefix ?? ""}${s}${field.props?.suffix ?? ""}`
    }
    case "matrix": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return ""
      const rows = field.props?.matrixRows ?? []
      const cols = field.props?.matrixColumns ?? []
      return Object.entries(value as Record<string, string>)
        .map(([rowId, colId]) => {
          const r = rows.find((x) => x.id === rowId)?.label ?? rowId
          const c = cols.find((x) => x.id === colId)?.label ?? colId
          return `${r}: ${c}`
        })
        .join("; ")
    }
    default:
      return String(value)
  }
}

function isRecordValue(v: unknown): v is Record<string, string | undefined> {
  return !!v && typeof v === "object" && !Array.isArray(v) && !isFileValue(v)
}

/** Converts an id-keyed value map into a key-keyed map (storage / export / webhook format). */
export function toKeyedData(schema: FormSchema, values: FormValues): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {}
  for (const field of schema.fields) {
    if (!isInputField(field)) continue
    const v = values[field.id]
    if (v === undefined) continue
    out[field.key] = v
  }
  return out
}

/** Converts stored key-keyed data back to id-keyed values. */
export function fromKeyedData(schema: FormSchema, data: Record<string, unknown>): FormValues {
  const out: FormValues = {}
  for (const field of schema.fields) {
    if (field.key in data) out[field.id] = data[field.key] as FieldValue
    else if (field.id in data) out[field.id] = data[field.id] as FieldValue
  }
  return out
}

export interface PipeExtras {
  score?: number | null
  maxScore?: number | null
  outcome?: string | null
  [key: string]: string | number | null | undefined
}

/**
 * Answer piping: replaces `{{field_key}}` tokens (and extras like `{{score}}`)
 * with formatted answers. Unknown tokens are replaced with an empty string.
 */
export function pipe(
  template: string,
  schema: FormSchema,
  values: FormValues,
  extras: PipeExtras = {}
): string {
  if (!template) return ""
  const byKey = new Map(schema.fields.map((f) => [f.key, f]))
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, token: string) => {
    if (token in extras) {
      const v = extras[token]
      return v === null || v === undefined ? "" : String(v)
    }
    const field = byKey.get(token)
    if (!field) return ""
    return formatValue(field, values[field.id])
  })
}

/** Numeric value used inside calculations. */
export function numericValue(field: FormField | undefined, value: FieldValue): number {
  if (!field) return 0
  if (typeof value === "number") return value
  if (typeof value === "boolean") return value ? 1 : 0
  if (Array.isArray(value)) {
    if (field.options?.some((o) => typeof o.points === "number")) {
      return value.reduce((acc, v) => acc + (field.options?.find((o) => o.value === v)?.points ?? 0), 0)
    }
    return value.length
  }
  if (typeof value === "string") {
    const opt = field.options?.find((o) => o.value === value)
    if (opt && typeof opt.points === "number") return opt.points
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}
