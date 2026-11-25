import { FIELD_DEFINITIONS } from "./fields"
import type { FormSchema, FormValues, QuizOutcome } from "./types"

/** Sums option points for scorable fields. Hidden (logic) fields can be excluded. */
export function computeScore(
  schema: FormSchema,
  values: FormValues,
  visibleIds?: Set<string>
): number {
  let total = 0
  for (const field of schema.fields) {
    if (!FIELD_DEFINITIONS[field.type]?.scorable) continue
    if (visibleIds && !visibleIds.has(field.id)) continue
    const v = values[field.id]
    const opts = field.options ?? []
    if (Array.isArray(v)) {
      for (const item of v) total += opts.find((o) => o.value === item)?.points ?? 0
    } else if (typeof v === "string") {
      total += opts.find((o) => o.value === v)?.points ?? 0
    }
  }
  return total
}

/** Maximum achievable score (best option for single-choice, sum of positives for multi). */
export function maxScore(schema: FormSchema): number {
  let total = 0
  for (const field of schema.fields) {
    const def = FIELD_DEFINITIONS[field.type]
    if (!def?.scorable) continue
    const pts = (field.options ?? []).map((o) => o.points ?? 0)
    if (pts.length === 0) continue
    if (field.type === "checkboxes" || field.type === "multi_select") {
      total += pts.filter((p) => p > 0).reduce((a, b) => a + b, 0)
    } else {
      total += Math.max(0, ...pts)
    }
  }
  return total
}

export function hasScoring(schema: FormSchema) {
  return schema.fields.some((f) => (f.options ?? []).some((o) => (o.points ?? 0) !== 0))
}

export function findOutcome(schema: FormSchema, score: number): QuizOutcome | null {
  return (
    schema.quiz.outcomes.find((o) => score >= o.minScore && score <= o.maxScore) ?? null
  )
}
