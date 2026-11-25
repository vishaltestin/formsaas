import type { FormField, FormSchema, Step } from "./types"

export const START_STEP_ID = "__start"
export const END_STEP_ID = "__end"

/** Splits the flat field list into steps using `step_break` blocks. */
export function getSteps(schema: Pick<FormSchema, "fields">): Step[] {
  const steps: Step[] = []
  let current: Step = { id: START_STEP_ID, index: 0, title: "Step 1", fields: [] }
  for (const field of schema.fields) {
    if (field.type === "step_break") {
      steps.push(current)
      current = {
        id: field.id,
        index: steps.length,
        title: field.label || `Step ${steps.length + 1}`,
        description: field.props?.content,
        fields: [],
      }
      continue
    }
    current.fields.push(field)
  }
  steps.push(current)
  // Drop an empty leading step when the schema starts with a step break.
  if (steps.length > 1 && steps[0].fields.length === 0) {
    steps.shift()
    steps.forEach((s, i) => (s.index = i))
  }
  if (steps[0] && steps[0].id === START_STEP_ID && steps.length > 1) {
    steps[0].title = steps[0].title === "Step 1" ? "Getting started" : steps[0].title
  }
  return steps
}

export function stepIndexOfField(steps: Step[], fieldId: string) {
  return steps.findIndex((s) => s.fields.some((f) => f.id === fieldId))
}

export function fieldById(schema: Pick<FormSchema, "fields">, id: string): FormField | undefined {
  return schema.fields.find((f) => f.id === id)
}
