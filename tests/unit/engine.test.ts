import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { csvCell, neutralizeFormula, toCsv } from "../../lib/csv"
import {
  computeCalculatedFields,
  computeScore,
  defaultSchema,
  evaluateLogic,
  formulaError,
  fromKeyedData,
  safeEvaluate,
  toKeyedData,
  validateValues,
  type FormField,
  type FormSchema,
  type FormValues,
} from "../../lib/form-engine"

function schemaOf(fields: FormField[], logic: FormSchema["logic"] = []): FormSchema {
  return { ...defaultSchema(), fields, logic }
}

const base = schemaOf(
  [
    { id: "f_name", key: "name", type: "short_text", label: "Name", required: true, validation: { minLength: 2, maxLength: 20 } },
    { id: "f_email", key: "email", type: "email", label: "Email", required: true },
    { id: "f_age", key: "age", type: "number", label: "Age", validation: { min: 18, max: 120 } },
    { id: "f_pw", key: "password", type: "password", label: "Password", validation: { minLength: 6 } },
    {
      id: "f_pw2",
      key: "confirm",
      type: "password",
      label: "Confirm",
      validation: { crossField: { operator: "equals", fieldId: "f_pw", message: "Passwords must match" } },
    },
    { id: "f_company", key: "company", type: "short_text", label: "Company", required: true },
    { id: "f_qty", key: "qty", type: "number", label: "Qty" },
    { id: "f_total", key: "total", type: "calculated", label: "Total", props: { formula: "{{qty}} * 12.5", decimals: 2 } },
    {
      id: "f_plan",
      key: "plan",
      type: "radio",
      label: "Plan",
      options: [
        { id: "o1", label: "A", value: "a", points: 1 },
        { id: "o2", label: "B", value: "b", points: 5 },
      ],
    },
  ],
  [
    {
      id: "r1",
      name: "Company only for business emails",
      enabled: true,
      combinator: "AND",
      conditions: [{ id: "c1", fieldId: "f_email", operator: "contains", value: "@corp.com" }],
      actions: [{ id: "a1", type: "SHOW_FIELD", targetFieldId: "f_company" }],
    },
  ]
)

function check(values: FormValues) {
  const logic = evaluateLogic(base, values)
  return { logic, res: validateValues(base, { ...values, ...logic.setValues }, logic.visibleFieldIds, { requiredIds: logic.required }) }
}

describe("validation (shared client/server zod schema)", () => {
  it("accepts a valid payload", () => {
    const { res } = check({ f_name: "Ada", f_email: "ada@example.com", f_age: 30, f_pw: "secret1", f_pw2: "secret1" })
    assert.equal(res.success, true)
  })

  it("rejects missing required, bad email, out-of-range numbers and length violations", () => {
    const { res } = check({ f_name: "A", f_email: "nope", f_age: 12 })
    assert.equal(res.success, false)
    if (res.success) return
    assert.ok(res.errors.f_name)
    assert.ok(res.errors.f_email)
    assert.ok(res.errors.f_age)
  })

  it("treats a payload with absent keys as empty (zod 4 null-fill)", () => {
    const { res } = check({})
    assert.equal(res.success, false)
    if (res.success) return
    assert.ok(res.errors.f_name && res.errors.f_email)
  })

  it("enforces cross-field rules", () => {
    const { res } = check({ f_name: "Ada", f_email: "ada@example.com", f_pw: "secret1", f_pw2: "secret2" })
    assert.equal(res.success, false)
    if (res.success) return
    assert.equal(res.errors.f_pw2, "Passwords must match")
  })

  it("rejects wrong value types (tampered payloads)", () => {
    const { res } = check({ f_name: { $gt: "" } as unknown as string, f_email: "ada@example.com", f_age: "abc" })
    assert.equal(res.success, false)
  })
})

describe("conditional logic", () => {
  it("keeps SHOW targets hidden and unvalidated until the condition matches", () => {
    const { logic, res } = check({ f_name: "Ada", f_email: "ada@example.com" })
    assert.equal(logic.visibleFieldIds.has("f_company"), false)
    assert.equal(res.success, true)
  })

  it("validates a revealed required field", () => {
    const { logic, res } = check({ f_name: "Ada", f_email: "ada@corp.com" })
    assert.equal(logic.visibleFieldIds.has("f_company"), true)
    assert.equal(res.success, false)
    if (!res.success) assert.ok(res.errors.f_company)
  })

  it("lets HIDE win over SHOW", () => {
    const s = schemaOf(base.fields, [
      ...base.logic,
      { id: "r2", name: "hide", enabled: true, combinator: "AND", conditions: [{ id: "c", fieldId: "f_name", operator: "equals", value: "Hide" }], actions: [{ id: "a", type: "HIDE_FIELD", targetFieldId: "f_company" }] },
    ])
    const logic = evaluateLogic(s, { f_email: "x@corp.com", f_name: "Hide" })
    assert.equal(logic.visibleFieldIds.has("f_company"), false)
  })

  it("skips disabled rules and respects enabled=false", () => {
    const logic = evaluateLogic(base, { f_email: "x@corp.com" }, { enabled: false })
    assert.equal(logic.visibleFieldIds.has("f_company"), true)
  })
})

describe("formulas & calculated fields", () => {
  it("evaluates arithmetic, precedence and functions", () => {
    assert.equal(safeEvaluate("1 + 2 * 3"), 7)
    assert.equal(safeEvaluate("(1 + 2) * 3"), 9)
    assert.equal(safeEvaluate("round(10 / 3, 2)"), 3.33)
    assert.equal(safeEvaluate("max(1, 7, 3) + min(4, 2)"), 9)
    assert.equal(safeEvaluate("if(a > 2, 10, 20)", { a: 3 }), 10)
  })

  it("never executes code", () => {
    for (const evil of ["constructor.constructor('return process')()", "process.exit(1)", "this", "x => 1", "globalThis", "a[0]", "`x`", "require('fs')"]) {
      assert.equal(safeEvaluate(evil), null, evil)
    }
  })

  it("rejects pathological nesting", () => {
    assert.equal(safeEvaluate("(".repeat(200) + "1" + ")".repeat(200)), null)
  })

  it("reports unknown keys in the formula editor", () => {
    assert.match(formulaError("{{nope}} + 1", ["qty"]) ?? "", /Unknown field/)
    assert.equal(formulaError("{{qty}} * 2", ["qty"]), null)
  })

  it("computes calculated fields from other answers", () => {
    const calc = computeCalculatedFields(base, { f_qty: 4 })
    assert.equal(calc.f_total, 50)
  })

  it("server recomputation overrides a tampered client value", () => {
    const logic = evaluateLogic(base, { f_qty: 2, f_total: 999999 })
    assert.equal(logic.setValues.f_total, 25)
  })
})

describe("scoring & keyed data", () => {
  it("sums option points", () => {
    assert.equal(computeScore(base, { f_plan: "b" }), 5)
  })
  it("round-trips id ↔ key data", () => {
    const values = { f_name: "Ada", f_email: "a@b.co" }
    const keyed = toKeyedData(base, values)
    assert.equal(keyed.name, "Ada")
    assert.deepEqual(fromKeyedData(base, keyed).f_email, "a@b.co")
  })
})

describe("CSV formula-injection protection", () => {
  it("neutralises dangerous prefixes", () => {
    for (const s of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1", "＝1"]) {
      assert.ok(neutralizeFormula(s).startsWith("'"), s)
    }
  })
  it("keeps plain negative numbers and normal text", () => {
    assert.equal(neutralizeFormula("-12.5"), "-12.5")
    assert.equal(neutralizeFormula("hello"), "hello")
  })
  it("quotes commas, quotes and newlines", () => {
    assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"')
    assert.equal(toCsv([["x", "=1"]]), "x,'=1")
  })
})
