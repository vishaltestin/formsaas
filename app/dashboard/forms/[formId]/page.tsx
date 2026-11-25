import { redirect } from "next/navigation"

import { landingSegment } from "@/lib/rbac/policy"
import { requireFormAccess } from "@/lib/rbac/server"

export default async function FormIndex(props: PageProps<"/dashboard/forms/[formId]">) {
  const { formId } = await props.params
  const { level } = await requireFormAccess(formId, "form.view")
  redirect(`/dashboard/forms/${formId}/${landingSegment(level)}`)
}
