import type { Metadata } from "next"

import { LogicEditor } from "@/components/logic/logic-editor"
import { getEffectivePlan } from "@/lib/entitlements"
import { normalizeMode, normalizeSchema } from "@/lib/form-engine"
import { requireFormAccess } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Logic" }

export default async function LogicPage(props: PageProps<"/dashboard/forms/[formId]/logic">) {
  const { formId } = await props.params
  const { form } = await requireFormAccess(formId, "form.edit")
  const plan = await getEffectivePlan(form.userId)
  return (
    <LogicEditor
      key={form.updatedAt.toISOString()}
      formId={form.id}
      mode={normalizeMode(form.mode)}
      schema={normalizeSchema(form.draftSchema)}
      enabled={plan.features.conditionalLogic}
    />
  )
}
