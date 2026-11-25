import type { Metadata } from "next"

import { FormBuilder } from "@/components/builder/form-builder"
import { getEffectivePlan } from "@/lib/entitlements"
import { normalizeMode, normalizeSchema, normalizeSettings, normalizeTheme } from "@/lib/form-engine"
import { requireFormAccess } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Builder" }

export default async function EditFormPage(props: PageProps<"/dashboard/forms/[formId]/edit">) {
  const { formId } = await props.params
  const { form } = await requireFormAccess(formId, "form.edit")
  const plan = await getEffectivePlan(form.userId)

  const settings = normalizeSettings(form.settings)
  // Never ship the password hash to the browser.
  const clientSettings = { ...settings, passwordHash: null }
  const draft = normalizeSchema(form.draftSchema)
  const hasUnpublishedChanges =
    form.status !== "DRAFT" && JSON.stringify(draft) !== JSON.stringify(normalizeSchema(form.publishedSchema))

  return (
    <FormBuilder
      key={form.id}
      formId={form.id}
      slug={form.slug}
      status={form.status}
      description={form.description ?? ""}
      hasUnpublishedChanges={hasUnpublishedChanges}
      initial={{
        title: form.title,
        mode: normalizeMode(form.mode),
        schema: draft,
        theme: normalizeTheme(form.themeConfig),
        settings: clientSettings,
      }}
      features={plan.features}
      maxUploadMb={plan.limits.maxFileUploadMb < 0 ? 100 : plan.limits.maxFileUploadMb}
    />
  )
}
