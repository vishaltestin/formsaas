import type { Metadata } from "next"

import { AutomationStudio } from "@/components/automations/automation-studio"
import { normalizeGraph } from "@/lib/automations/graph"
import { processDueRuns } from "@/lib/automations/runner"
import { toRunView } from "@/lib/automations/view"
import { getEffectivePlan } from "@/lib/entitlements"
import { isInputField, normalizeSchema } from "@/lib/form-engine"
import { workspaceAllowsCustomEmail } from "@/lib/email/template-store"
import { prisma } from "@/lib/prisma"
import { requireFormAccess } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Automations" }

export default async function AutomationsPage(props: PageProps<"/dashboard/forms/[formId]/automations">) {
  const { formId } = await props.params
  const sp = await props.searchParams
  const { form } = await requireFormAccess(formId, "automations.manage")
  await processDueRuns().catch(() => 0)

  const [plan, automations, emailTemplates, customEmail] = await Promise.all([
    getEffectivePlan(form.userId),
    prisma.automation.findMany({ where: { formId }, orderBy: { createdAt: "asc" } }),
    prisma.emailTemplate.findMany({ where: { workspaceId: form.workspaceId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    workspaceAllowsCustomEmail(form.workspaceId),
  ])
  const requestedRun = typeof sp.run === "string" ? await prisma.automationRun.findFirst({ where: { id: sp.run, automation: { formId } }, select: { automationId: true } }) : null
  const selectedId = (typeof sp.a === "string" && automations.some((a) => a.id === sp.a) ? sp.a : requestedRun?.automationId) ?? automations[0]?.id ?? null

  const [runs, stats] = await Promise.all([
    selectedId
      ? prisma.automationRun.findMany({ where: { automationId: selectedId }, orderBy: { startedAt: "desc" }, take: 50, include: { steps: { orderBy: { startedAt: "asc" } } } })
      : Promise.resolve([]),
    prisma.automationRun.groupBy({ by: ["automationId", "status"], where: { automation: { formId } }, _count: { _all: true } }),
  ])

  const schema = normalizeSchema(form.publishedSchema ?? form.draftSchema)
  const fields = schema.fields.filter(isInputField).map((f) => ({ key: f.key, label: f.label || f.key }))

  return (
    <AutomationStudio
      key={selectedId ?? "none"}
      formId={form.id}
      formTitle={form.title}
      fields={fields}
      webhooksAllowed={plan.features.webhooks}
      automations={automations.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        enabled: a.enabled,
        trigger: a.trigger,
        graph: normalizeGraph(a.graph),
        updatedAt: a.updatedAt.toISOString(),
        runs: stats.filter((s) => s.automationId === a.id).reduce((n, s) => n + s._count._all, 0),
        failed: stats.filter((s) => s.automationId === a.id && s.status === "FAILED").reduce((n, s) => n + s._count._all, 0),
      }))}
      selectedId={selectedId}
      runs={runs.map(toRunView)}
      initialRunId={typeof sp.run === "string" ? sp.run : null}
      emailTemplates={{ options: emailTemplates, allowed: customEmail }}
    />
  )
}
