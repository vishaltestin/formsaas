import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { deleteStep, duplicateStep, moveStep, removeAllStepBreaks, stepFieldIds } from "../../components/builder/ops"
import { TEMPLATES } from "../../lib/templates"
import {
  aadhaarValid,
  ageOn,
  appointmentDates,
  appointmentSlots,
  customFontFaces,
  defaultSchema,
  evaluateLogic,
  FIELD_TYPES,
  fieldAvailableIn,
  formatValue,
  getSteps,
  googleFontsHref,
  gstinValid,
  ibanValid,
  ifscValid,
  isFreeEmail,
  normalizeTheme,
  panValid,
  phoneValid,
  sampleFieldValue,
  sanitizeCustomFonts,
  START_STEP_ID,
  validateValues,
  videoEmbedUrl,
  createField,
  type FormField,
  type FormSchema,
} from "../../lib/form-engine"

function schemaOf(fields: FormField[]): FormSchema {
  return { ...defaultSchema(), fields, logic: [] }
}

function check(field: FormField, value: unknown) {
  const s = schemaOf([field])
  return validateValues(s, { [field.id]: value }, new Set([field.id]))
}

describe("identity validators", () => {
  it("accepts valid IDs and rejects tampered ones", () => {
    assert.ok(aadhaarValid("2345 6789 0124"))
    assert.ok(!aadhaarValid("2345 6789 0125"))
    assert.ok(!aadhaarValid("0345 6789 0124"), "Aadhaar never starts with 0 or 1")
    assert.ok(gstinValid("27AAPFU0939F1ZV"))
    assert.ok(!gstinValid("27AAPFU0939F1ZX"), "GSTIN checksum")
    assert.ok(panValid("ABCPE1234F"))
    assert.ok(!panValid("ABCXE1234F"), "4th PAN char must be a holder type")
    assert.ok(ifscValid("HDFC0001234"))
    assert.ok(!ifscValid("HDFC1001234"))
    assert.ok(ibanValid("GB82 WEST 1234 5698 7654 32"))
    assert.ok(!ibanValid("GB82 WEST 1234 5698 7654 33"))
  })

  it("flags consumer mailboxes and validates phone numbers", () => {
    assert.ok(isFreeEmail("someone@gmail.com"))
    assert.ok(!isFreeEmail("ops@acme.in"))
    assert.ok(phoneValid("+91 98765 43210", true))
    assert.ok(!phoneValid("+91 12345", true))
  })

  it("computes ages on a given day", () => {
    assert.equal(ageOn("2000-06-15", "2026-06-14"), 25)
    assert.equal(ageOn("2000-06-15", "2026-06-15"), 26)
  })
})

describe("new field types (shared zod schema)", () => {
  const field = (type: FormField["type"], extra: Partial<FormField> = {}): FormField => ({ ...createField(type), id: `f_${type}`, key: type, label: type, required: true, ...extra })

  it("every input type's sample value passes its own validator", () => {
    for (const type of FIELD_TYPES) {
      const f = field(type, type === "ranking" || type === "radio" || type === "select" || type === "checkboxes" || type === "multi_select" || type === "image_choice" ? {} : {})
      if (["heading", "paragraph", "divider", "image", "video", "step_break", "calculated", "file", "signature", "hidden"].includes(type)) continue
      const v = sampleFieldValue(f)
      const res = check(f, v)
      assert.ok(res.success, `${type} sample ${JSON.stringify(v)} failed: ${JSON.stringify(!res.success && res.errors)}`)
    }
  })

  it("short_text formats use checksum validation", () => {
    const f = field("short_text", { validation: { format: "gstin" } })
    assert.ok(check(f, "27AAPFU0939F1ZV").success)
    assert.ok(!check(f, "27AAPFU0939F1ZX").success)
  })

  it("business email and minimum age rules", () => {
    const email = field("email", { validation: { businessEmail: true } })
    assert.ok(!check(email, "ada@gmail.com").success)
    assert.ok(check(email, "ada@northwind.dev").success)
    const dob = field("date", { validation: { minAge: 18 } })
    assert.ok(!check(dob, new Date().toISOString().slice(0, 10)).success)
    assert.ok(check(dob, "1990-01-01").success)
  })

  it("composite values: full name, address, date range, country, color", () => {
    const name = field("full_name")
    assert.ok(check(name, { first: "Ada", last: "Lovelace" }).success)
    assert.ok(!check(name, { first: "Ada", last: "" }).success)
    const addr = field("address", { props: { defaultCountry: "IN" } })
    assert.ok(check(addr, { line1: "12 MG Road", city: "Pune", state: "MH", postal: "411001", country: "IN" }).success)
    assert.ok(!check(addr, { line1: "12 MG Road", city: "Pune", state: "MH", postal: "41100", country: "IN" }).success, "Indian PIN is 6 digits")
    const range = field("date_range")
    assert.ok(check(range, { start: "2026-01-01", end: "2026-01-05" }).success)
    assert.ok(!check(range, { start: "2026-01-05", end: "2026-01-01" }).success)
    assert.ok(check(field("country"), "IN").success)
    assert.ok(!check(field("country"), "XX").success)
    assert.ok(check(field("color"), "#2849c7").success)
    assert.ok(!check(field("color"), "blue").success)
  })

  it("ranking must contain every option exactly once", () => {
    const f = field("ranking", {
      options: [
        { id: "a", label: "A", value: "a" },
        { id: "b", label: "B", value: "b" },
      ],
    })
    assert.ok(check(f, ["b", "a"]).success)
    assert.ok(!check(f, ["a", "a"]).success)
    assert.ok(!check(f, ["a"]).success)
  })

  it("appointment slots respect the configured window and weekdays", () => {
    const props = { slotStart: "10:00", slotEnd: "12:00", slotMinutes: 30, weekdays: [1, 2, 3, 4, 5], daysAhead: 14 }
    assert.deepEqual(appointmentSlots(props), ["10:00", "10:30", "11:00", "11:30"])
    const dates = appointmentDates(props, "2026-11-23")
    assert.ok(dates.length > 0)
    for (const d of dates) assert.ok(![0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay()), `${d} is a weekend`)
    const f = field("appointment", { props })
    assert.ok(!check(f, { date: dates[0], time: "12:00" }).success, "12:00 is outside the window")
  })

  it("formats values for exports and receipts", () => {
    assert.equal(formatValue(field("full_name", { props: { showTitle: true } }), { title: "Dr", first: "Ada", last: "Lovelace" }), "Dr Ada Lovelace")
    assert.match(formatValue(field("country"), "IN"), /India/)
  })

  it("parses video URLs into privacy-friendly embeds", () => {
    assert.equal(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")
    assert.equal(videoEmbedUrl("javascript:alert(1)"), null)
  })
})

describe("step breaks", () => {
  const brk = (id: string, label: string): FormField => ({ id, key: id, type: "step_break", label })
  const txt = (id: string): FormField => ({ id, key: id, type: "short_text", label: id })
  const schema = (): FormSchema => ({
    ...schemaOf([txt("a"), brk("s2", "Two"), txt("b"), txt("c"), brk("s3", "Three"), txt("d")]),
    logic: [
      {
        id: "r1",
        name: "jump",
        enabled: true,
        combinator: "AND",
        conditions: [{ id: "c1", fieldId: "a", operator: "is_not_empty", value: "" }],
        actions: [{ id: "x1", type: "JUMP_TO_STEP", targetStepId: "s2" }],
      },
    ],
  })

  it("are only offered in stepper and quiz modes", () => {
    assert.ok(fieldAvailableIn("step_break", "STEPPER"))
    assert.ok(fieldAvailableIn("step_break", "QUIZ"))
    assert.ok(!fieldAvailableIn("step_break", "CLASSIC"))
    assert.ok(!fieldAvailableIn("step_break", "CARD"))
  })

  it("deleteStep removes a whole step with its fields and jump rules", () => {
    const s = schema()
    assert.deepEqual(stepFieldIds(s, "s2"), ["b", "c"])
    const next = deleteStep(s, "s2", false)
    assert.deepEqual(next.fields.map((f) => f.id), ["a", "s3", "d"])
    assert.equal(next.logic[0]?.actions.length ?? 0, 0)
  })

  it("deleteStep with keepFields merges into the previous step", () => {
    const next = deleteStep(schema(), "s2", true)
    assert.deepEqual(next.fields.map((f) => f.id), ["a", "b", "c", "s3", "d"])
    const first = deleteStep(schema(), START_STEP_ID, true)
    assert.deepEqual(first.fields.map((f) => f.id), ["a", "b", "c", "s3", "d"])
  })

  it("duplicate, move and strip", () => {
    const dup = duplicateStep(schema(), "s3", "Three")
    assert.equal(getSteps(dup.schema).length, 4)
    assert.equal(dup.schema.fields[dup.schema.fields.length - 2].id, dup.stepId)
    const moved = moveStep(schema(), "s3", -1)
    assert.deepEqual(moved.fields.map((f) => f.id), ["a", "s3", "d", "s2", "b", "c"])
    assert.deepEqual(moveStep(schema(), "s2", -1).fields.map((f) => f.id), schema().fields.map((f) => f.id), "the first step stays first")
    assert.deepEqual(removeAllStepBreaks(schema()).fields.map((f) => f.id), ["a", "b", "c", "d"])
  })
})

describe("custom fonts", () => {
  it("drops unsafe names and payloads", () => {
    const fonts = sanitizeCustomFonts([
      { family: "Acme Sans", format: "woff2", dataUrl: "data:font/woff2;base64,AAAA" },
      { family: 'Evil"}body{', format: "woff2", dataUrl: "data:font/woff2;base64,AAAA" },
      { family: "Bad Data", format: "woff2", dataUrl: "javascript:alert(1)" },
    ])
    assert.deepEqual(fonts.map((f) => f.family), ["Acme Sans"])
    assert.match(customFontFaces({ customFonts: fonts }), /@font-face\{font-family:"Acme Sans"/)
  })

  it("does not request uploaded families from Google and sanitises typed names", () => {
    const theme = normalizeTheme({ fontFamily: "Acme Sans", headingFont: "Fraunces", customFonts: [{ family: "Acme Sans", format: "woff2", dataUrl: "data:font/woff2;base64,AAAA" }] })
    const href = googleFontsHref(theme) ?? ""
    assert.ok(!href.includes("Acme"))
    assert.ok(href.includes("Fraunces"))
    const hostile = normalizeTheme({ fontFamily: "x</style><script>" }).fontFamily
    assert.ok(/^[A-Za-z0-9 ]+$/.test(hostile), `unsafe font name kept: ${hostile}`)
  })
})

describe("templates", () => {
  it("every template's sample submission validates", () => {
    for (const t of TEMPLATES) {
      const values: Record<string, unknown> = {}
      for (const f of t.schema.fields) if (!["file", "signature", "calculated"].includes(f.type)) values[f.id] = sampleFieldValue(f)
      const logic = evaluateLogic(t.schema, values as never)
      const ids = new Set([...logic.visibleFieldIds].filter((id) => !["file", "signature"].includes(t.schema.fields.find((f) => f.id === id)?.type ?? "")))
      const res = validateValues(t.schema, { ...values, ...logic.setValues }, ids, { requiredIds: logic.required })
      assert.ok(res.success, `${t.id}: ${JSON.stringify(!res.success && res.errors)}`)
    }
  })
})
