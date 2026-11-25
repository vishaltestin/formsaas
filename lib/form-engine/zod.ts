import { z } from "zod"

import { isInputField } from "./fields"
import { countryByCode } from "./countries"
import { isBlankComposite, isEmptyValue, isFileValue } from "./format"
import type { FieldValue, FormField, FormSchema } from "./types"
import {
  ageOn,
  addDaysIso,
  appointmentSlots,
  FORMAT_RULES,
  isFreeEmail,
  phoneValid,
  weekdayOf,
  APPOINTMENT_DEFAULTS,
} from "./validators"

const PHONE_RE = /^\+?[0-9\s().-]{7,20}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/
const HEX_RE = /^#[0-9a-f]{6}$/i

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v) && !isFileValue(v)
}

const part = (v: unknown) => (typeof v === "string" ? v.trim() : "")

function postalValid(country: string, postal: string) {
  if (country === "IN") return FORMAT_RULES.pincode_in.test(postal)
  if (country === "US") return FORMAT_RULES.zip_us.test(postal)
  if (country === "GB") return FORMAT_RULES.postcode_uk.test(postal)
  return /^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/.test(postal)
}

export interface BuildZodOptions {
  /** Field ids that logic has made required. */
  requiredIds?: Set<string>
  /** Server-side hard cap for uploads (plan limit). */
  maxUploadMb?: number
}

function todayIso() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

function mimeAllowed(type: string, accept: string[] | undefined) {
  if (!accept || accept.length === 0) return true
  return accept.some((a) => {
    const rule = a.trim().toLowerCase()
    if (!rule) return true
    if (rule.endsWith("/*")) return type.toLowerCase().startsWith(rule.slice(0, -1))
    return type.toLowerCase() === rule
  })
}

/** Zod schema validating a single non-empty value of a field. */
function valueSchema(field: FormField, opts: BuildZodOptions): z.ZodType {
  const v = field.validation ?? {}
  const m = v.messages ?? {}
  const optionValues = (field.options ?? []).map((o) => o.value)

  const withText = (base: z.ZodString) => {
    let s = base
    if (typeof v.minLength === "number")
      s = s.min(v.minLength, m.minLength || `Must be at least ${v.minLength} characters`)
    if (typeof v.maxLength === "number")
      s = s.max(v.maxLength, m.maxLength || `Must be at most ${v.maxLength} characters`)
    if (v.pattern) {
      try {
        s = s.regex(new RegExp(v.pattern), m.pattern || "Invalid format")
      } catch {
        /* invalid user regex is ignored */
      }
    }
    if (v.format === "email") s = s.regex(z.regexes.email, m.format || "Enter a valid email")
    if (v.format === "url") s = s.regex(/^https?:\/\/\S+\.\S+/, m.format || "Enter a valid URL")
    if (v.format === "phone") s = s.regex(PHONE_RE, m.format || "Enter a valid phone number")
    if (v.format === "alphanumeric") s = s.regex(/^[a-z0-9]+$/i, m.format || "Only letters and numbers")
    const rule = v.format && v.format !== "none" && !["email", "url", "phone", "alphanumeric"].includes(v.format) ? FORMAT_RULES[v.format] : null
    if (rule) s = s.refine((x) => rule.test(x), m.format || rule.message)
    return s
  }

  switch (field.type) {
    case "short_text":
    case "long_text":
    case "password":
    case "hidden":
      return withText(z.string({ error: "Must be text" }))
    case "email": {
      const email = withText(z.string()).pipe(z.email(m.format || "Enter a valid email address"))
      return v.businessEmail ? email.refine((x) => !isFreeEmail(x), m.format || "Please use your work email address") : email
    }
    case "url":
      return withText(z.string()).pipe(
        z.url({ protocol: /^https?$/, error: m.format || "Enter a valid URL (https://…)" })
      )
    case "phone":
      return field.props?.countryCode
        ? z.string().refine((x) => phoneValid(x, true), m.format || "Enter a valid phone number for the selected country")
        : withText(z.string()).regex(PHONE_RE, m.format || "Enter a valid phone number").refine((x) => phoneValid(x, false), m.format || "Enter a valid phone number")
    case "full_name":
      return z.custom<FieldValue>((x) => isRecord(x), "Enter your name").superRefine((val, ctx) => {
        const r = val as Record<string, unknown>
        if (!part(r.first)) ctx.addIssue({ code: "custom", message: m.required || "Enter a first name" })
        else if (!part(r.last)) ctx.addIssue({ code: "custom", message: m.required || "Enter a last name" })
        else if (["title", "first", "middle", "last"].some((k) => part(r[k]).length > 80))
          ctx.addIssue({ code: "custom", message: "Name parts must be 80 characters or fewer" })
        else if (Object.keys(r).some((k) => !["title", "first", "middle", "last"].includes(k)))
          ctx.addIssue({ code: "custom", message: "Invalid name payload" })
      })
    case "address":
      return z.custom<FieldValue>((x) => isRecord(x), "Enter an address").superRefine((val, ctx) => {
        const r = val as Record<string, unknown>
        const country = part(r.country).toUpperCase()
        if (Object.keys(r).some((k) => !["line1", "line2", "city", "state", "postal", "country"].includes(k)))
          return void ctx.addIssue({ code: "custom", message: "Invalid address payload" })
        if (["line1", "line2", "city", "state", "postal"].some((k) => part(r[k]).length > 160))
          return void ctx.addIssue({ code: "custom", message: "Address lines must be 160 characters or fewer" })
        if (!part(r.line1)) return void ctx.addIssue({ code: "custom", message: "Enter a street address" })
        if (!part(r.city)) return void ctx.addIssue({ code: "custom", message: "Enter a city" })
        if (!country || !countryByCode(country)) return void ctx.addIssue({ code: "custom", message: "Choose a country" })
        if (!part(r.postal)) return void ctx.addIssue({ code: "custom", message: "Enter a postal code" })
        if (!postalValid(country, part(r.postal))) ctx.addIssue({ code: "custom", message: `Enter a valid postal code for ${countryByCode(country)?.[1]}` })
      })
    case "country":
      return z.string().refine((x) => !!countryByCode(x), m.selection || "Choose a country")
    case "currency": {
      let n = z.coerce.number({ error: "Enter a valid amount" }).refine((x) => Number.isFinite(x), "Enter a valid amount")
      if (typeof v.min === "number") n = n.refine((x) => x >= v.min!, m.min || `Must be at least ${v.min}`)
      if (typeof v.max === "number") n = n.refine((x) => x <= v.max!, m.max || `Must be at most ${v.max}`)
      return n
    }
    case "color":
      return z.string().regex(HEX_RE, "Choose a colour (#RRGGBB)")
    case "slider": {
      const min = field.props?.scaleMin ?? 0
      const max = field.props?.scaleMax ?? 100
      const step = field.props?.step && field.props.step > 0 ? field.props.step : 1
      return z.coerce
        .number({ error: "Choose a value" })
        .min(min, `Choose a value between ${min} and ${max}`)
        .max(max, `Choose a value between ${min} and ${max}`)
        .refine((x) => Math.abs((x - min) / step - Math.round((x - min) / step)) < 1e-6, `Must be in steps of ${step}`)
    }
    case "ranking":
      return z
        .array(z.string())
        .refine(
          (xs) => new Set(xs).size === xs.length && xs.length === optionValues.length && xs.every((x) => optionValues.includes(x)),
          m.selection || "Rank every option"
        )
    case "datetime":
      return z
        .string()
        .regex(DATETIME_RE, "Enter a valid date and time")
        .superRefine((val, ctx) => {
          const day = val.slice(0, 10)
          const today = todayIso()
          if (v.dateMin && day < v.dateMin) ctx.addIssue({ code: "custom", message: m.date || `Must be on or after ${v.dateMin}` })
          if (v.dateMax && day > v.dateMax) ctx.addIssue({ code: "custom", message: m.date || `Must be on or before ${v.dateMax}` })
          if (v.dateRule === "past" && day > today) ctx.addIssue({ code: "custom", message: m.date || "Must be in the past" })
          if (v.dateRule === "future" && day < today) ctx.addIssue({ code: "custom", message: m.date || "Must be in the future" })
        })
    case "date_range":
      return z.custom<FieldValue>((x) => isRecord(x), "Choose a start and end date").superRefine((val, ctx) => {
        const r = val as Record<string, unknown>
        const start = part(r.start)
        const end = part(r.end)
        if (!DATE_RE.test(start) || !DATE_RE.test(end)) return void ctx.addIssue({ code: "custom", message: m.date || "Choose a start and end date" })
        if (end < start) return void ctx.addIssue({ code: "custom", message: m.date || "End date must be on or after the start date" })
        if (v.dateMin && start < v.dateMin) ctx.addIssue({ code: "custom", message: m.date || `Dates must be on or after ${v.dateMin}` })
        if (v.dateMax && end > v.dateMax) ctx.addIssue({ code: "custom", message: m.date || `Dates must be on or before ${v.dateMax}` })
      })
    case "appointment":
      return z.custom<FieldValue>((x) => isRecord(x), "Choose a time slot").superRefine((val, ctx) => {
        const r = val as Record<string, unknown>
        const date = part(r.date)
        const time = part(r.time)
        if (!DATE_RE.test(date)) return void ctx.addIssue({ code: "custom", message: "Choose a day" })
        if (!time) return void ctx.addIssue({ code: "custom", message: "Choose a time slot" })
        const today = todayIso()
        const ahead = field.props?.daysAhead ?? APPOINTMENT_DEFAULTS.daysAhead
        // one day of tolerance either side absorbs respondent/server timezone differences
        if (date < addDaysIso(today, -1) || date > addDaysIso(today, ahead + 1))
          return void ctx.addIssue({ code: "custom", message: "That day is outside the booking window" })
        const weekdays = field.props?.weekdays?.length ? field.props.weekdays : APPOINTMENT_DEFAULTS.weekdays
        if (!weekdays.includes(weekdayOf(date))) return void ctx.addIssue({ code: "custom", message: "Bookings aren't available on that day" })
        if (!appointmentSlots(field.props).includes(time)) ctx.addIssue({ code: "custom", message: "Choose one of the available time slots" })
      })
    case "number": {
      let n = z.coerce.number({ error: "Enter a valid number" })
      if (typeof v.min === "number") n = n.min(v.min, m.min || `Must be ${v.min} or more`)
      if (typeof v.max === "number") n = n.max(v.max, m.max || `Must be ${v.max} or less`)
      return n
    }
    case "select":
    case "radio":
    case "image_choice":
      return z
        .string()
        .refine((x) => optionValues.length === 0 || optionValues.includes(x), m.selection || "Choose a valid option")
    case "multi_select":
    case "checkboxes": {
      let arr = z.array(z.string()).refine(
        (xs) => xs.every((x) => optionValues.includes(x)),
        m.selection || "Contains an invalid option"
      )
      if (typeof v.minSelected === "number")
        arr = arr.refine((xs) => xs.length >= v.minSelected!, m.selection || `Select at least ${v.minSelected}`)
      if (typeof v.maxSelected === "number")
        arr = arr.refine((xs) => xs.length <= v.maxSelected!, m.selection || `Select at most ${v.maxSelected}`)
      return arr
    }
    case "yes_no":
      return z.boolean({ error: "Choose yes or no" })
    case "consent":
      return z.literal(true, { error: m.required || "You must agree to continue" })
    case "rating": {
      const max = field.props?.maxRating ?? 5
      return z.coerce.number().int().min(1, "Choose a rating").max(max)
    }
    case "scale": {
      const min = field.props?.scaleMin ?? 0
      const max = field.props?.scaleMax ?? 10
      return z.coerce.number().int().min(min).max(max, `Choose a value between ${min} and ${max}`)
    }
    case "matrix": {
      const rows = field.props?.matrixRows ?? []
      return z.record(z.string(), z.string()).refine(
        (val) => !field.required || rows.every((r) => !!val[r.id]),
        m.required || "Answer every row"
      )
    }
    case "date": {
      return z
        .string()
        .regex(DATE_RE, "Enter a valid date")
        .superRefine((val, ctx) => {
          const today = todayIso()
          if (v.dateMin && val < v.dateMin)
            ctx.addIssue({ code: "custom", message: m.date || `Date must be on or after ${v.dateMin}` })
          if (v.dateMax && val > v.dateMax)
            ctx.addIssue({ code: "custom", message: m.date || `Date must be on or before ${v.dateMax}` })
          if (v.dateRule === "past" && val > today)
            ctx.addIssue({ code: "custom", message: m.date || "Date must be in the past" })
          if (v.dateRule === "future" && val < today)
            ctx.addIssue({ code: "custom", message: m.date || "Date must be in the future" })
          if (typeof v.minAge === "number" && ageOn(val, today) < v.minAge)
            ctx.addIssue({ code: "custom", message: m.date || `You must be at least ${v.minAge} years old` })
          if (typeof v.maxAge === "number" && ageOn(val, today) > v.maxAge)
            ctx.addIssue({ code: "custom", message: m.date || `Age must be ${v.maxAge} or under` })
        })
    }
    case "time":
      return z.string().regex(TIME_RE, "Enter a valid time (HH:MM)")
    case "file": {
      const fieldMax = v.maxFileMb ?? 10
      const max = Math.min(fieldMax, opts.maxUploadMb ?? fieldMax)
      return z.custom<FieldValue>((val) => isFileValue(val), "Upload a file").superRefine((val, ctx) => {
        if (!isFileValue(val)) return
        if (val.size > max * 1024 * 1024)
          ctx.addIssue({ code: "custom", message: m.file || `File must be ${max} MB or smaller` })
        if (!mimeAllowed(val.type, v.accept))
          ctx.addIssue({ code: "custom", message: m.file || `File type not allowed (${(v.accept ?? []).join(", ")})` })
        if (!val.dataUrl.startsWith("data:"))
          ctx.addIssue({ code: "custom", message: "Invalid file payload" })
      })
    }
    case "calculated":
      return z.coerce.number({ error: "Calculation failed" })
    case "signature":
      return z
        .string()
        .refine((x) => x.startsWith("data:image/"), m.required || "Please sign in the box")
    default:
      return z.any()
  }
}

function compare(a: FieldValue, b: FieldValue, op: string) {
  const na = Number(a)
  const nb = Number(b)
  const numeric = a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb)
  const x: string | number = numeric ? na : String(a ?? "")
  const y: string | number = numeric ? nb : String(b ?? "")
  switch (op) {
    case "equals":
      return x === y
    case "not_equals":
      return x !== y
    case "gt":
      return x > y
    case "gte":
      return x >= y
    case "lt":
      return x < y
    case "lte":
      return x <= y
    default:
      return true
  }
}

const OP_TEXT: Record<string, string> = {
  equals: "match",
  not_equals: "differ from",
  gt: "be greater than",
  gte: "be at least",
  lt: "be less than",
  lte: "be at most",
}

/**
 * Compiles a FormSchema into a Zod object schema.
 *
 * Shared by the client (`zodResolver` inside react-hook-form) and the server
 * submission endpoint. Only `visibleFieldIds` are validated so conditional
 * logic is respected; non-visible fields pass through untouched.
 */
export function buildZodSchema(
  schema: FormSchema,
  visibleFieldIds: Set<string>,
  opts: BuildZodOptions = {}
) {
  const shape: Record<string, z.ZodType> = {}

  for (const field of schema.fields) {
    if (!isInputField(field)) continue
    if (!visibleFieldIds.has(field.id) || field.type === "calculated") {
      shape[field.id] = z.any().optional()
      continue
    }
    const required = !!field.required || !!opts.requiredIds?.has(field.id)
    const requiredMsg = field.validation?.messages?.required || "This field is required"
    const inner = valueSchema(field, opts)

    shape[field.id] = z.any().superRefine((value, ctx) => {
      const empty =
        isEmptyValue(value) || (field.type === "consent" && value === false) || isBlankComposite(field, value)
      if (empty) {
        if (required) ctx.addIssue({ code: "custom", message: requiredMsg })
        return
      }
      const parsed = inner.safeParse(value)
      if (!parsed.success) {
        const first = parsed.error.issues[0]
        ctx.addIssue({ code: "custom", message: first?.message || "Invalid value" })
      }
    })
  }

  const inputIds = Object.keys(shape)
  const object = z.object(shape).superRefine((data, ctx) => {
    for (const field of schema.fields) {
      const rule = field.validation?.crossField
      if (!rule || !rule.fieldId || !visibleFieldIds.has(field.id)) continue
      const own = (data as Record<string, FieldValue>)[field.id]
      const other = (data as Record<string, FieldValue>)[rule.fieldId]
      if (isEmptyValue(own)) continue
      if (!compare(own, other, rule.operator)) {
        const otherField = schema.fields.find((f) => f.id === rule.fieldId)
        ctx.addIssue({
          code: "custom",
          path: [field.id],
          message:
            rule.message ||
            `Must ${OP_TEXT[rule.operator] ?? "match"} “${otherField?.label ?? "the other field"}”`,
        })
      }
    }
  })

  // Missing keys would bypass refinements, so normalise them to null first.
  return z.preprocess((input) => {
    const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
    const filled: Record<string, unknown> = {}
    for (const id of inputIds) filled[id] = src[id] === undefined ? null : src[id]
    return filled
  }, object)
}

/** Convenience: validate values and return a flat id → message map. */
export function validateValues(
  schema: FormSchema,
  values: Record<string, unknown>,
  visibleFieldIds: Set<string>,
  opts?: BuildZodOptions
): { success: true } | { success: false; errors: Record<string, string> } {
  const result = buildZodSchema(schema, visibleFieldIds, opts).safeParse(values)
  if (result.success) return { success: true }
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "_form")
    if (!errors[key]) errors[key] = issue.message
  }
  return { success: false, errors }
}
