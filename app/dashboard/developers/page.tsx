import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/app/page-header"
import { DeveloperPortal } from "@/components/developers/developer-portal"
import { buildOpenApiSpec } from "@/lib/api/openapi"
import { parseScopes } from "@/lib/api/keys"
import { isInputField, normalizeSchema, sampleFieldValue } from "@/lib/form-engine"
import { appUrl } from "@/lib/format"
import { prisma } from "@/lib/prisma"
import { levelAllows } from "@/lib/rbac/policy"
import { accessibleFormsWhere, formLevels, requireWorkspace, type Membership } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Developers" }

async function loadPortal(userId: string, membership: Membership) {
  const now = Date.now()
  const since = new Date(now - 86400000)
  const visible = await prisma.form.findMany({ where: accessibleFormsWhere(userId, membership), select: { id: true, createdById: true } })
  const levels = await formLevels(userId, membership, visible)
  const hookFormIds = visible.filter((f) => levelAllows(levels.get(f.id), "webhooks.manage")).map((f) => f.id)
  const ws = membership.workspaceId
  const [keys, logs, deliveries, forms, counts] = await Promise.all([
    prisma.apiKey.findMany({ where: { userId, workspaceId: ws }, orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }] }),
    prisma.apiRequestLog.findMany({ where: { userId, apiKey: { workspaceId: ws } }, orderBy: { createdAt: "desc" }, take: 200, include: { apiKey: { select: { prefix: true } } } }),
    prisma.webhookDelivery.findMany({
      where: { webhook: { formId: { in: hookFormIds } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { webhook: { select: { url: true, form: { select: { title: true } } } } },
    }),
    prisma.form.findMany({
      where: { id: { in: visible.map((f) => f.id) } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        submissions: { select: { id: true }, orderBy: { createdAt: "desc" }, take: 10 },
        automations: { select: { id: true, name: true, trigger: true, enabled: true } },
      },
    }),
    prisma.apiRequestLog.groupBy({ by: ["apiKeyId"], where: { userId, apiKey: { workspaceId: ws }, createdAt: { gte: since } }, _count: { _all: true } }),
  ])

  const spec = buildOpenApiSpec(appUrl())
  const reference = Object.entries(spec.paths).flatMap(([path, ops]) =>
    Object.entries(ops as Record<string, unknown>)
      .filter(([m]) => ["get", "post", "patch", "delete"].includes(m))
      .map(([m, op]) => ({ method: m.toUpperCase(), path, summary: (op as { summary: string }).summary, scope: (op as { "x-scope"?: string })["x-scope"] ?? null }))
  )

  return { now, keys, logs, deliveries, forms, counts, reference }
}

export default async function DevelopersPage() {
  const { user, membership } = await requireWorkspace()
  const { now, keys, logs, deliveries, forms, counts, reference } = await loadPortal(user.id, membership)
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Developers"
        description={`Keys created here act inside “${membership.workspaceName}” with your own live permissions — they can never reach forms you can't.`}
      />
      <Suspense>
        <DeveloperPortal
          now={now}
          baseUrl={appUrl()}
          reference={reference}
          keys={keys.map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.prefix,
            scopes: parseScopes(k.scopes),
            rateLimit: k.rateLimit,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            expiresAt: k.expiresAt?.toISOString() ?? null,
            revokedAt: k.revokedAt?.toISOString() ?? null,
            requests24h: counts.find((c) => c.apiKeyId === k.id)?._count._all ?? 0,
          }))}
          logs={logs.map((l) => ({
            id: l.id,
            method: l.method,
            path: l.path,
            status: l.status,
            durationMs: l.durationMs,
            keyPrefix: l.apiKey?.prefix ?? null,
            error: l.error,
            createdAt: l.createdAt.toISOString(),
          }))}
          deliveries={deliveries.map((d) => ({
            id: d.id,
            event: d.event,
            url: d.webhook.url,
            formTitle: d.webhook.form.title,
            statusCode: d.statusCode,
            success: d.success,
            responseMs: d.responseMs,
            attempt: d.attempt,
            error: d.error,
            payload: d.payload,
            responseBody: d.responseBody,
            createdAt: d.createdAt.toISOString(),
          }))}
          forms={forms.map((f) => {
            const schema = normalizeSchema(f.publishedSchema ?? f.draftSchema)
            return {
              id: f.id,
              title: f.title,
              status: f.status,
              fields: schema.fields.filter(isInputField).map((x) => ({ key: x.key, type: x.type, label: x.label, required: !!x.required, options: x.options?.map((o) => o.value), sample: sampleFieldValue(x) })),
              submissionIds: f.submissions.map((s) => s.id),
              automations: f.automations,
            }
          })}
        />
      </Suspense>
    </div>
  )
}
