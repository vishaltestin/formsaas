import type { Metadata } from "next"

import { AnalyticsView } from "@/components/analytics/analytics-view"
import { PageHeader } from "@/components/app/page-header"
import { getFormAnalytics, type RangeDays } from "@/lib/analytics"
import { requireFormAccess } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Analytics" }

export default async function AnalyticsPage(props: PageProps<"/dashboard/forms/[formId]/analytics">) {
  const { formId } = await props.params
  const sp = await props.searchParams
  const raw = Number(Array.isArray(sp.range) ? sp.range[0] : sp.range)
  const range: RangeDays = raw === 7 || raw === 90 ? raw : 30
  const { form } = await requireFormAccess(formId, "form.view")
  const data = await getFormAnalytics(form.id, range)
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <PageHeader title="Analytics" description={`Performance of “${form.title}”`} />
      <AnalyticsView data={data} />
    </div>
  )
}
