import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { WebhooksPanel, type WebhookRow } from "@/components/integrations/webhooks-panel"
import { getEffectivePlan } from "@/lib/entitlements"
import { normalizeSettings } from "@/lib/form-engine"
import { prisma } from "@/lib/prisma"
import { requireFormAccess } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Integrations" }

export default async function IntegrationsPage(props: PageProps<"/dashboard/forms/[formId]/integrations">) {
  const { formId } = await props.params
  const { form } = await requireFormAccess(formId, "webhooks.manage")
  const [plan, hooks] = await Promise.all([
    getEffectivePlan(form.userId),
    prisma.webhook.findMany({
      where: { formId },
      orderBy: { createdAt: "asc" },
      include: { deliveries: { orderBy: { createdAt: "desc" }, take: 15 } },
    }),
  ])
  const settings = normalizeSettings(form.settings)

  const rows: WebhookRow[] = hooks.map((h) => ({
    id: h.id,
    name: h.name,
    url: h.url,
    secret: h.secret,
    headers: (h.headers && typeof h.headers === "object" && !Array.isArray(h.headers) ? h.headers : {}) as Record<string, string>,
    isActive: h.isActive,
    createdAt: h.createdAt.toISOString(),
    successRate: h.deliveries.length ? h.deliveries.filter((d) => d.success).length / h.deliveries.length : null,
    deliveries: h.deliveries.map((d) => ({
      id: d.id,
      event: d.event,
      statusCode: d.statusCode,
      responseMs: d.responseMs,
      success: d.success,
      attempt: d.attempt,
      createdAt: d.createdAt.toISOString(),
      payload: d.payload,
      responseBody: d.responseBody,
      error: d.error,
    })),
  }))

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <PageHeader title="Integrations" description="Signed webhooks fire the moment a response is submitted." />
      <WebhooksPanel formId={form.id} hooks={rows} enabled={plan.features.webhooks} webhooksOn={settings.webhooksEnabled} />
    </div>
  )
}
