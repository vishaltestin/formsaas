import type { Form, Submission } from "@/generated/prisma/client"
import { isInputField, normalizeSchema, type FormSchema } from "@/lib/form-engine"
import { appUrl } from "@/lib/format"

export function apiFields(schema: FormSchema) {
  return schema.fields.filter(isInputField).map((f) => ({
    id: f.id,
    key: f.key,
    type: f.type,
    label: f.label,
    required: !!f.required,
    ...(f.options?.length ? { options: f.options.map((o) => o.value), optionLabels: f.options.map((o) => o.label) } : {}),
    ...(f.type === "calculated" ? { readOnly: true } : {}),
  }))
}

export function formToApi(form: Form) {
  const live = form.publishedSchema ? normalizeSchema(form.publishedSchema) : null
  const draft = normalizeSchema(form.draftSchema)
  return {
    id: form.id,
    object: "form" as const,
    title: form.title,
    description: form.description,
    slug: form.slug,
    mode: form.mode,
    status: form.status,
    url: `${appUrl()}/f/${form.slug}`,
    publishedAt: form.publishedAt?.toISOString() ?? null,
    hasUnpublishedChanges: !live || JSON.stringify(live) !== JSON.stringify(draft),
    fields: apiFields(live ?? draft),
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  }
}

export function submissionToApi(s: Submission) {
  const meta = (s.metadata ?? {}) as Record<string, unknown>
  return {
    id: s.id,
    object: "submission" as const,
    formId: s.formId,
    status: s.status,
    score: s.computedScore,
    tags: Array.isArray(s.tags) ? s.tags : [],
    notes: s.notes,
    data: s.data,
    metadata: {
      channel: meta.channel ?? (meta.embedType === "API" ? "api" : "public"),
      source: meta.embedType ?? null,
      device: meta.device ?? null,
      completionSeconds: meta.completionSeconds ?? null,
      utm: meta.utm ?? {},
    },
    createdAt: s.createdAt.toISOString(),
  }
}
