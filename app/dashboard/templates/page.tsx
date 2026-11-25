import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { TemplateGallery } from "@/components/templates/template-gallery"
import { getUserPlanInfo } from "@/lib/entitlements"
import { requireWorkspace } from "@/lib/rbac/server"
import { TEMPLATES } from "@/lib/templates"

export const metadata: Metadata = { title: "Templates" }

export default async function TemplatesPage() {
  // Members without the Editor role can't create forms, so they never see the gallery.
  const { membership } = await requireWorkspace("form.create")
  const info = await getUserPlanInfo(membership.ownerId)
  const limitReached = info.limits.maxForms >= 0 && info.usage.forms >= info.limits.maxForms
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <PageHeader title="Templates" description="Production-ready starting points. Every template is fully editable — fields, logic, theme and settings." />
      <TemplateGallery templates={TEMPLATES} limitReached={limitReached} maxForms={info.limits.maxForms} />
    </div>
  )
}
