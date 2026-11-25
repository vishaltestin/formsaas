import { arrayMove } from "@dnd-kit/sortable"

import {
  createField,
  END_STEP_ID,
  isInputField,
  START_STEP_ID,
  uid,
  uniqueKey,
  type FieldType,
  type FormField,
  type FormSchema,
} from "@/lib/form-engine"

export function takenKeys(schema: FormSchema, exceptId?: string) {
  return new Set(schema.fields.filter((f) => f.id !== exceptId).map((f) => f.key))
}

/** Maps every field id to the id of the step it belongs to. */
export function stepMap(schema: FormSchema) {
  const map: Record<string, string> = {}
  let current = START_STEP_ID
  for (const f of schema.fields) {
    if (f.type === "step_break") current = f.id
    map[f.id] = current
  }
  return map
}

/** Index to insert at so the new field lands at the end of `stepId`. */
export function endOfStepIndex(schema: FormSchema, stepId: string | null) {
  if (!stepId || stepId === "all") return schema.fields.length
  const map = stepMap(schema)
  let last = -1
  schema.fields.forEach((f, i) => {
    if (map[f.id] === stepId) last = i
  })
  return last === -1 ? schema.fields.length : last + 1
}

export function insertField(schema: FormSchema, type: FieldType, index?: number): { schema: FormSchema; field: FormField } {
  const field = createField(type, takenKeys(schema))
  const fields = [...schema.fields]
  fields.splice(index ?? fields.length, 0, field)
  return { schema: { ...schema, fields }, field }
}

export function duplicateField(schema: FormSchema, id: string): { schema: FormSchema; field: FormField | null } {
  const idx = schema.fields.findIndex((f) => f.id === id)
  if (idx === -1) return { schema, field: null }
  const src = schema.fields[idx]
  const copy: FormField = structuredClone(src)
  copy.id = uid("f")
  copy.key = uniqueKey(`${src.key}_copy`, takenKeys(schema))
  copy.label = isInputField(src) || src.type === "heading" || src.type === "step_break" ? `${src.label} (copy)` : src.label
  copy.options = copy.options?.map((o) => ({ ...o, id: uid("o") }))
  const fields = [...schema.fields]
  fields.splice(idx + 1, 0, copy)
  return { schema: { ...schema, fields }, field: copy }
}

/** Removes a field and every logic reference to it. */
export function removeField(schema: FormSchema, id: string): FormSchema {
  const fields = schema.fields.filter((f) => f.id !== id)
  const logic = schema.logic.map((r) => ({
    ...r,
    conditions: r.conditions.filter((c) => c.fieldId !== id),
    actions: r.actions.filter((a) => a.targetFieldId !== id && a.targetStepId !== id),
  }))
  const layout = { ...(schema.logicLayout ?? {}) }
  delete layout[id]
  return { ...schema, fields, logic, logicLayout: layout }
}

export function moveField(schema: FormSchema, activeId: string, overId: string): FormSchema {
  const from = schema.fields.findIndex((f) => f.id === activeId)
  const to = schema.fields.findIndex((f) => f.id === overId)
  if (from === -1 || to === -1 || from === to) return schema
  return { ...schema, fields: arrayMove(schema.fields, from, to) }
}

export function moveFieldBy(schema: FormSchema, id: string, delta: number): FormSchema {
  const from = schema.fields.findIndex((f) => f.id === id)
  const to = from + delta
  if (from === -1 || to < 0 || to >= schema.fields.length) return schema
  return { ...schema, fields: arrayMove(schema.fields, from, to) }
}

export function patchField(schema: FormSchema, id: string, patch: Partial<FormField>): FormSchema {
  return { ...schema, fields: schema.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }
}

export { END_STEP_ID, START_STEP_ID }

/* ───────────── Step operations ───────────── */

/** [start, end) indices of a step's blocks, including its own step_break (if any). */
export function stepRange(schema: FormSchema, stepId: string): [number, number] | null {
  const map = stepMap(schema)
  let start = -1
  let end = -1
  schema.fields.forEach((f, i) => {
    if (map[f.id] !== stepId) return
    if (start === -1) start = i
    end = i + 1
  })
  if (stepId === START_STEP_ID && start === -1) return [0, 0]
  return start === -1 ? null : [start, end]
}

/** Ids of the fields a step contains (excluding its step_break). */
export function stepFieldIds(schema: FormSchema, stepId: string) {
  const map = stepMap(schema)
  return schema.fields.filter((f) => map[f.id] === stepId && f.type !== "step_break").map((f) => f.id)
}

/**
 * Deletes a whole step.
 * - keepFields=false removes the step's fields and its break (and every logic reference to them).
 * - keepFields=true removes only the break, merging the fields into the neighbouring step.
 */
export function deleteStep(schema: FormSchema, stepId: string, keepFields: boolean): FormSchema {
  const range = stepRange(schema, stepId)
  if (!range) return schema
  let next = schema
  if (keepFields) {
    if (stepId === START_STEP_ID) {
      // The first step has no break of its own: merge it with the following step instead.
      const following = schema.fields.slice(range[1]).find((f) => f.type === "step_break")
      return following ? removeField(schema, following.id) : schema
    }
    return removeField(schema, stepId)
  }
  const ids = schema.fields.slice(range[0], range[1]).map((f) => f.id)
  for (const id of ids) next = removeField(next, id)
  // Retarget jumps that pointed at the deleted step to the end of the form.
  next = {
    ...next,
    logic: next.logic.map((r) => ({ ...r, actions: r.actions.filter((a) => !(a.type === "JUMP_TO_STEP" && a.targetStepId === stepId)) })),
  }
  return next
}

/** Clones a step (fields + break) right after itself with fresh ids and keys. */
export function duplicateStep(schema: FormSchema, stepId: string, title: string): { schema: FormSchema; stepId: string | null } {
  const range = stepRange(schema, stepId)
  if (!range || range[0] === range[1]) return { schema, stepId: null }
  const taken = takenKeys(schema)
  const block = schema.fields.slice(range[0], range[1])
  const copies: FormField[] = []
  if (block[0]?.type !== "step_break") {
    const brk = createField("step_break", taken)
    taken.add(brk.key)
    copies.push({ ...brk, label: `${title} (copy)` })
  }
  for (const src of block) {
    const copy: FormField = structuredClone(src)
    copy.id = uid("f")
    copy.key = uniqueKey(`${src.key}_copy`, taken)
    taken.add(copy.key)
    if (src.type === "step_break") copy.label = `${src.label || title} (copy)`
    copy.options = copy.options?.map((o) => ({ ...o, id: uid("o") }))
    copies.push(copy)
  }
  const fields = [...schema.fields]
  fields.splice(range[1], 0, ...copies)
  return { schema: { ...schema, fields }, stepId: copies[0].id }
}

/** Swaps a step with its neighbour. The implicit first step (no break) stays first. */
export function moveStep(schema: FormSchema, stepId: string, delta: -1 | 1): FormSchema {
  if (stepId === START_STEP_ID) return schema
  const breaks = schema.fields.filter((f) => f.type === "step_break").map((f) => f.id)
  const i = breaks.indexOf(stepId)
  const j = i + delta
  if (i === -1 || j < 0 || j >= breaks.length) return schema
  const a = stepRange(schema, breaks[Math.min(i, j)])!
  const b = stepRange(schema, breaks[Math.max(i, j)])!
  const f = schema.fields
  const fields = [...f.slice(0, a[0]), ...f.slice(b[0], b[1]), ...f.slice(a[1], b[0]), ...f.slice(a[0], a[1]), ...f.slice(b[1])]
  return { ...schema, fields }
}

/** Removes every step break while keeping all fields (used when a form leaves step-based modes). */
export function removeAllStepBreaks(schema: FormSchema): FormSchema {
  let next = schema
  for (const f of schema.fields) if (f.type === "step_break") next = removeField(next, f.id)
  return next
}
