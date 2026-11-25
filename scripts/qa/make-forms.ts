import { TEMPLATES } from "../../lib/templates"
import { createField, FIELD_TYPES } from "../../lib/form-engine"
const out: unknown[] = []
for (const id of ["vendor-kyc-onboarding", "consultation-booking"]) {
  const t = TEMPLATES.find((x) => x.id === id)!
  out.push({ title: `QA ${t.name}`, mode: "CLASSIC", schema: { fields: t.schema.fields.filter((f) => f.type !== "step_break"), logic: [] } })
}
const taken = new Set<string>()
const all = FIELD_TYPES.filter((t) => !["step_break", "hidden", "calculated"].includes(t)).map((t) => {
  const f = createField(t, taken); taken.add(f.key)
  if (t === "phone") f.props = { ...f.props, countryCode: true, defaultCountry: "IN" }
  f.width = ["phone", "email", "country", "currency", "full_name", "date_range", "address"].includes(t) ? "half" : "full"
  return f
})
out.push({ title: "QA All fields", mode: "CLASSIC", schema: { fields: all, logic: [] } })
console.log(JSON.stringify(out))
