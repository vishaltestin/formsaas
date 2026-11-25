import { FormNav } from "@/components/forms/form-nav"
import { prisma } from "@/lib/prisma"
import { FORM_SECTIONS, levelAllows, type FormSection } from "@/lib/rbac/policy"
import { requireFormAccess } from "@/lib/rbac/server"

export default async function FormLayout(props: LayoutProps<"/dashboard/forms/[formId]">) {
  const { formId } = await props.params
  const { form, level, membership } = await requireFormAccess(formId, "form.view")
  const newCount = await prisma.submission.count({ where: { formId, status: "NEW" } })
  const sections = (Object.keys(FORM_SECTIONS) as FormSection[]).filter((s) => levelAllows(level, FORM_SECTIONS[s]))
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FormNav
        formId={form.id}
        slug={form.slug}
        status={form.status}
        newCount={newCount}
        sections={sections}
        level={level}
        workspaceName={membership.workspaceName}
      />
      {props.children}
    </div>
  )
}
