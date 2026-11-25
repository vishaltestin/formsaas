import { safeEvaluate } from "./expression"
import { isInputField } from "./fields"
import { isEmptyValue, numericValue, pipe } from "./format"
import { computeScore } from "./score"
import { END_STEP_ID, START_STEP_ID, getSteps, stepIndexOfField } from "./steps"
import type {
  FieldValue,
  FormMode,
  FormSchema,
  FormValues,
  LogicCondition,
  LogicRule,
  Step,
} from "./types"

export interface LogicEnding {
  ruleId: string
  redirectUrl?: string
  title?: string
  message?: string
}

export interface LogicResult {
  /** Input & layout field ids hidden by SHOW/HIDE rules */
  hidden: Set<string>
  /** Fields made required by REQUIRE_FIELD */
  required: Set<string>
  /** Values computed by SET_VALUE / CALCULATE */
  setValues: Record<string, FieldValue>
  /** First matching ending (redirect / custom thank you) */
  ending: LogicEnding | null
  matchedRuleIds: Set<string>
  steps: Step[]
  /** Step indexes the respondent will traverse (jumps applied) */
  path: number[]
  /** Input field ids that are currently visible and must be validated */
  visibleFieldIds: Set<string>
}

function normalize(v: unknown) {
  return String(v ?? "").trim().toLowerCase()
}

function asComparable(v: FieldValue): string | number | boolean | string[] | null {
  if (v === undefined || v === null) return null
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === "object") return Object.values(v as Record<string, string>).map(String)
  return v as string | number | boolean
}

export function evaluateCondition(
  cond: LogicCondition,
  values: FormValues,
  schema: FormSchema,
  hidden?: Set<string>
): boolean {
  const field = schema.fields.find((f) => f.id === cond.fieldId)
  if (!field) return false
  const raw = hidden?.has(field.id) ? undefined : values[field.id]
  const value = asComparable(raw)
  const target = cond.value ?? ""

  switch (cond.operator) {
    case "is_empty":
      return isEmptyValue(raw)
    case "is_not_empty":
      return !isEmptyValue(raw)
    case "equals":
    case "not_equals": {
      let eq: boolean
      if (Array.isArray(value)) eq = value.map(normalize).includes(normalize(target))
      else if (typeof value === "boolean")
        eq = String(value) === normalize(target) || (value ? ["yes", "1", "on"] : ["no", "0", "off"]).includes(normalize(target))
      else if (typeof value === "number" || (value !== null && target !== "" && !Number.isNaN(Number(value)) && !Number.isNaN(Number(target))))
        eq = Number(value) === Number(target)
      else {
        // match option value OR option label
        const opt = field.options?.find((o) => o.value === value)
        eq = normalize(value) === normalize(target) || (opt ? normalize(opt.label) === normalize(target) : false)
      }
      return cond.operator === "equals" ? eq : !eq
    }
    case "contains": {
      if (Array.isArray(value)) return value.map(normalize).some((v) => v.includes(normalize(target)))
      return normalize(value).includes(normalize(target))
    }
    case "greater_than":
    case "less_than": {
      const n = numericValue(field, raw)
      const t = Number(target)
      if (Number.isNaN(t) || isEmptyValue(raw)) return false
      return cond.operator === "greater_than" ? n > t : n < t
    }
    default:
      return false
  }
}

export function ruleMatches(
  rule: LogicRule,
  values: FormValues,
  schema: FormSchema,
  hidden?: Set<string>
) {
  if (!rule.enabled || rule.conditions.length === 0) return false
  const results = rule.conditions.map((c) => evaluateCondition(c, values, schema, hidden))
  return rule.combinator === "OR" ? results.some(Boolean) : results.every(Boolean)
}

/** Substitutes {{key}} tokens with numeric answers and evaluates a formula. */
export function evaluateFormula(expression: string, schema: FormSchema, values: FormValues): number | null {
  const byKey = new Map(schema.fields.map((f) => [f.key, f]))
  let score: number | null = null
  const substituted = expression.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    if (key === "score") {
      score ??= computeScore(schema, values)
      return `(${score})`
    }
    const f = byKey.get(key)
    return `(${numericValue(f, f ? values[f.id] : undefined)})`
  })
  return safeEvaluate(substituted)
}

/**
 * Computes every `calculated` field. Formulas may reference other calculated
 * fields regardless of order; we iterate until values settle (bounded).
 * The server always recomputes these, so client-supplied values are ignored.
 */
export function computeCalculatedFields(schema: FormSchema, values: FormValues): Record<string, number> {
  const calcs = schema.fields.filter((f) => f.type === "calculated")
  const out: Record<string, number> = {}
  if (calcs.length === 0) return out
  let working: FormValues = { ...values }
  for (const f of calcs) delete working[f.id]
  for (let pass = 0; pass < Math.min(calcs.length + 1, 6); pass++) {
    let changed = false
    for (const f of calcs) {
      const raw = evaluateFormula(f.props?.formula ?? "", schema, working)
      const d = Math.max(0, Math.min(10, f.props?.decimals ?? 2))
      const v = raw === null ? 0 : Math.round(raw * 10 ** d) / 10 ** d
      if (out[f.id] !== v) changed = true
      out[f.id] = v
    }
    working = { ...working, ...out }
    if (!changed) break
  }
  return out
}

function computeSetValue(
  expression: string,
  calculate: boolean | undefined,
  schema: FormSchema,
  values: FormValues
): FieldValue {
  if (!calculate) return pipe(expression, schema, values)
  const result = evaluateFormula(expression, schema, values)
  return result === null ? "" : result
}

/**
 * Evaluates every rule against the current values and resolves visibility,
 * requirement, computed values, endings and the step path.
 *
 * Runs identically in the builder preview, the public renderer and the
 * submission API, guaranteeing client/server parity.
 */
export function evaluateLogic(
  schema: FormSchema,
  values: FormValues,
  options: { mode?: FormMode; enabled?: boolean } = {}
): LogicResult {
  const mode = options.mode ?? "CLASSIC"
  const enabled = options.enabled ?? true
  const rules = enabled ? schema.logic.filter((r) => r.enabled) : []
  const steps = getSteps(schema)

  // Fields targeted by SHOW_FIELD start hidden.
  const showTargets = new Set<string>()
  for (const r of rules)
    for (const a of r.actions) if (a.type === "SHOW_FIELD" && a.targetFieldId) showTargets.add(a.targetFieldId)

  let hidden = new Set<string>(showTargets)
  let required = new Set<string>()
  let setValues: Record<string, FieldValue> = {}
  let rawSet: Record<string, FieldValue> = {}
  let matched = new Set<string>()
  let ending: LogicEnding | null = null
  let working: FormValues = { ...values, ...computeCalculatedFields(schema, values) }

  // Iterate to a fixed point so chained rules (A shows B, B's answer shows C) settle.
  for (let pass = 0; pass < 4; pass++) {
    const nextHidden = new Set<string>(showTargets)
    const nextRequired = new Set<string>()
    const nextSet: Record<string, FieldValue> = {}
    const nextMatched = new Set<string>()
    let nextEnding: LogicEnding | null = null

    for (const rule of rules) {
      if (!ruleMatches(rule, working, schema, hidden)) continue
      nextMatched.add(rule.id)
      for (const action of rule.actions) {
        switch (action.type) {
          case "SHOW_FIELD":
            if (action.targetFieldId) nextHidden.delete(action.targetFieldId)
            break
          case "HIDE_FIELD":
            if (action.targetFieldId) nextHidden.add(action.targetFieldId)
            break
          case "REQUIRE_FIELD":
            if (action.targetFieldId) nextRequired.add(action.targetFieldId)
            break
          case "SET_VALUE":
            if (action.targetFieldId)
              nextSet[action.targetFieldId] = computeSetValue(action.value ?? "", action.calculate, schema, working)
            break
          case "REDIRECT_OR_CUSTOM_THANK_YOU":
            if (!nextEnding)
              nextEnding = {
                ruleId: rule.id,
                redirectUrl: action.redirectUrl || undefined,
                title: action.thankYouTitle || undefined,
                message: action.thankYouMessage || undefined,
              }
            break
          default:
            break
        }
      }
    }
    // HIDE wins over SHOW when both match, already ensured by order (adds after deletes within rules
    // only if later). Re-apply hides explicitly for determinism:
    for (const rule of rules) {
      if (!nextMatched.has(rule.id)) continue
      for (const a of rule.actions) if (a.type === "HIDE_FIELD" && a.targetFieldId) nextHidden.add(a.targetFieldId)
    }

    const stable =
      nextHidden.size === hidden.size &&
      [...nextHidden].every((id) => hidden.has(id)) &&
      JSON.stringify(nextSet) === JSON.stringify(rawSet)

    hidden = nextHidden
    required = nextRequired
    setValues = nextSet
    rawSet = nextSet
    matched = nextMatched
    ending = nextEnding
    const base = { ...values, ...setValues }
    const calc = computeCalculatedFields(schema, base)
    setValues = { ...setValues, ...calc }
    working = { ...base, ...calc }
    if (stable && pass > 0) break
  }

  const path = resolvePath(schema, steps, rules, working, hidden, mode)

  const onPath = new Set<number>(path)
  const visibleFieldIds = new Set<string>()
  steps.forEach((step, idx) => {
    if (mode !== "CLASSIC" && !onPath.has(idx)) return
    for (const f of step.fields) {
      if (!isInputField(f)) continue
      if (hidden.has(f.id)) continue
      visibleFieldIds.add(f.id)
    }
  })

  return { hidden, required, setValues, ending, matchedRuleIds: matched, steps, path, visibleFieldIds }
}

function resolveTargetIndex(steps: Step[], targetStepId: string | undefined): number | "end" | null {
  if (!targetStepId) return null
  if (targetStepId === END_STEP_ID) return "end"
  if (targetStepId === START_STEP_ID) return 0
  const idx = steps.findIndex((s) => s.id === targetStepId)
  return idx === -1 ? null : idx
}

/** Owning step of a rule = the furthest step containing one of its condition fields. */
export function ruleStepIndex(steps: Step[], rule: LogicRule) {
  return Math.max(-1, ...rule.conditions.map((c) => stepIndexOfField(steps, c.fieldId)))
}

function resolvePath(
  schema: FormSchema,
  steps: Step[],
  rules: LogicRule[],
  values: FormValues,
  hidden: Set<string>,
  mode: FormMode
): number[] {
  if (mode === "CLASSIC" || steps.length <= 1) return steps.map((_, i) => i)
  const path: number[] = []
  let i = 0
  let guard = 0
  while (i < steps.length && guard++ < steps.length + 2) {
    path.push(i)
    let next: number | "end" = i + 1
    for (const rule of rules) {
      const jump = rule.actions.find((a) => a.type === "JUMP_TO_STEP")
      if (!jump) continue
      if (ruleStepIndex(steps, rule) !== i) continue
      if (!ruleMatches(rule, values, schema, hidden)) continue
      const target = resolveTargetIndex(steps, jump.targetStepId)
      // Only forward jumps are honoured to prevent loops.
      if (target === "end") {
        next = "end"
        break
      }
      if (target !== null && target > i) {
        next = target
        break
      }
    }
    if (next === "end") break
    i = next
  }
  return path
}

/** Next step index after `current` following the resolved path, or "end". */
export function nextStepIndex(result: LogicResult, current: number): number | "end" {
  const pos = result.path.indexOf(current)
  if (pos === -1) {
    const after = result.path.find((p) => p > current)
    return after ?? "end"
  }
  return pos + 1 < result.path.length ? result.path[pos + 1] : "end"
}

export function prevStepIndex(result: LogicResult, current: number): number | null {
  const pos = result.path.indexOf(current)
  if (pos > 0) return result.path[pos - 1]
  const before = [...result.path].reverse().find((p) => p < current)
  return before ?? null
}
