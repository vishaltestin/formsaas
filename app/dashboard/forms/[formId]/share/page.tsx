import type { Metadata } from "next"

import { SharePanel } from "@/components/share/share-panel"
import { getEffectivePlan } from "@/lib/entitlements"
import { normalizeTheme } from "@/lib/form-engine"
import { appUrl } from "@/lib/format"
import { requireFormAccess } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Share & embed" }

export default async function SharePage(props: PageProps<"/dashboard/forms/[formId]/share">) {
  const { formId } = await props.params
  const { form } = await requireFormAccess(formId, "form.share")
  const plan = await getEffectivePlan(form.userId)
  const theme = normalizeTheme(form.themeConfig)
  return (
    <SharePanel
      formId={form.id}
      slug={form.slug}
      title={form.title}
      status={form.status}
      appUrl={appUrl()}
      advancedEmbeds={plan.features.advancedEmbeds}
      accent={/^#[0-9a-f]{6}$/i.test(theme.colors.primary) ? theme.colors.primary : "#18181b"}
    />
  )
}
