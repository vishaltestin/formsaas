import type { Metadata } from "next"
import Link from "next/link"
import { BarChart3Icon, FileTextIcon, InboxIcon, LayoutTemplateIcon, PencilIcon, PlusIcon, ShieldCheckIcon, TriangleAlertIcon, WorkflowIcon } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { FormRowActions } from "@/components/forms/form-row-actions"
import { NewFormDialog } from "@/components/forms/new-form-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getUserPlanInfo, startOfMonth } from "@/lib/entitlements"
import { timeAgo } from "@/lib/format"
import { prisma } from "@/lib/prisma"
import { LEVEL_LABELS, levelAllows, roleCan } from "@/lib/rbac/policy"
import { accessibleFormsWhere, formLevels, requireWorkspace, type Membership } from "@/lib/rbac/server"
import { TEMPLATES } from "@/lib/templates"

export const metadata: Metadata = { title: "Forms" }

const STATUS_VARIANT = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  CLOSED: "outline",
} as const

async function loadDashboard(userId: string, membership: Membership) {
  const now = Date.now()
  const since = new Date(now - 30 * 86400000)
  const since7 = new Date(now - 7 * 86400000)
  const since1 = new Date(now - 86400000)
  // Only forms this member can see in the active workspace — stats never leak other forms.
  const formWhere = accessibleFormsWhere(userId, membership)
  const [plan, forms, views30, subs30, recent7, runs7, failedRuns7, waiting, api24] = await Promise.all([
    getUserPlanInfo(membership.ownerId),
    prisma.form.findMany({
      where: formWhere,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        mode: true,
        updatedAt: true,
        createdById: true,
        createdBy: { select: { name: true, email: true } },
        _count: { select: { submissions: true, automations: true } },
        submissions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.formEvent.count({ where: { form: formWhere, type: "VIEW", createdAt: { gte: since } } }),
    prisma.submission.count({ where: { form: formWhere, createdAt: { gte: since } } }),
    prisma.submission.groupBy({ by: ["formId"], where: { form: formWhere, createdAt: { gte: since7 } }, _count: { _all: true } }),
    prisma.automationRun.count({ where: { automation: { form: formWhere }, startedAt: { gte: since7 } } }),
    prisma.automationRun.count({ where: { automation: { form: formWhere }, startedAt: { gte: since7 }, status: "FAILED" } }),
    prisma.automationRun.findMany({
      where: { automation: { form: formWhere }, status: "WAITING_APPROVAL" },
      orderBy: { startedAt: "asc" },
      take: 50,
      select: { id: true, automation: { select: { formId: true } } },
    }),
    prisma.apiRequestLog.count({ where: { userId, apiKey: { workspaceId: membership.workspaceId }, createdAt: { gte: since1 } } }),
  ])
  const [newThisMonth, levels] = await Promise.all([
    prisma.submission.count({ where: { form: formWhere, status: "NEW", createdAt: { gte: startOfMonth() } } }),
    formLevels(userId, membership, forms),
  ])
  return { plan, forms, views30, subs30, recent7, runs7, failedRuns7, waiting, api24, newThisMonth, levels }
}

export default async function DashboardPage() {
  const { user, membership } = await requireWorkspace()
  const { plan, forms, views30, subs30, recent7, runs7, failedRuns7, waiting, api24, newThisMonth, levels } = await loadDashboard(user.id, membership)
  const canCreate = roleCan(membership.role, "form.create")
  const isOwnerPlan = membership.ownerId === user.id

  const templates = TEMPLATES.map(({ id, name, description, mode, category, highlights }) => ({
    id,
    name,
    description,
    mode,
    category,
    highlights,
  }))
  const limitReached = plan.limits.maxForms >= 0 && plan.usage.forms >= plan.limits.maxForms
  const subsNear =
    plan.limits.monthlySubmissions > 0 && plan.usage.monthlySubmissions / plan.limits.monthlySubmissions >= 0.8

  const stats = [
    { label: "Forms", value: forms.length.toString(), hint: `${forms.filter((f) => f.status === "PUBLISHED").length} live` },
    { label: "Views 30d", value: views30.toLocaleString(), hint: null },
    { label: "Responses 30d", value: subs30.toLocaleString(), hint: `${newThisMonth} new` },
    { label: "Conversion", value: views30 ? `${Math.round((subs30 / views30) * 1000) / 10}%` : "—", hint: null },
    { label: "Runs 7d", value: runs7.toLocaleString(), hint: failedRuns7 ? `${failedRuns7} failed` : null, href: null },
    { label: "API 24h", value: api24.toLocaleString(), hint: null, href: "/dashboard/developers?tab=logs" },
  ]
  const usagePct = plan.limits.monthlySubmissions > 0 ? Math.min(100, Math.round((plan.usage.monthlySubmissions / plan.limits.monthlySubmissions) * 100)) : null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title="Forms"
        description={
          canCreate
            ? `Design, publish and analyse every form in ${membership.workspaceName}.`
            : `Forms assigned to you in ${membership.workspaceName}. Ask an admin for the Editor role to create your own.`
        }
        actions={
          canCreate ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/templates">
                  <LayoutTemplateIcon /> Templates
                </Link>
              </Button>
              <NewFormDialog templates={templates} limitReached={limitReached} />
            </>
          ) : undefined
        }
      />

      {canCreate && (limitReached || subsNear) && (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>{limitReached ? "You've reached your form limit" : "Approaching your monthly response limit"}</AlertTitle>
          <AlertDescription>
            {limitReached
              ? `The ${plan.plan.name} plan includes ${plan.limits.maxForms} forms.`
              : `${plan.usage.monthlySubmissions.toLocaleString()} of ${plan.limits.monthlySubmissions.toLocaleString()} responses used this month.`}{" "}
            {isOwnerPlan ? (
              <Link href="/dashboard/billing" className="font-medium underline underline-offset-4">
                Request an upgrade
              </Link>
            ) : (
              "The workspace owner manages the plan."
            )}
          </AlertDescription>
        </Alert>
      )}

      {waiting.length > 0 && (
        <Alert>
          <ShieldCheckIcon />
          <AlertTitle>
            <span className="font-mono tabular-nums">{waiting.length}</span> automation run{waiting.length === 1 ? " is" : "s are"} waiting for approval
          </AlertTitle>
          <AlertDescription>
            <Link href={`/dashboard/forms/${waiting[0].automation.formId}/automations?run=${waiting[0].id}`} className="font-medium underline underline-offset-4">
              Review the oldest request
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid grid-cols-2 divide-y rounded-lg border sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-7 lg:divide-x">
        {stats.map((s) => (
          <div key={s.label} className="px-4 py-3">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 flex items-baseline gap-2">
              {s.href ? (
                <Link href={s.href} className="font-mono text-lg font-medium tabular-nums hover:underline">
                  {s.value}
                </Link>
              ) : (
                <span className="font-mono text-lg font-medium tabular-nums">{s.value}</span>
              )}
              {s.hint && <span className="truncate text-xs text-muted-foreground">{s.hint}</span>}
            </dd>
          </div>
        ))}
        <div className="col-span-2 px-4 py-3 sm:col-span-3 lg:col-span-1">
          <dt className="text-xs text-muted-foreground">{plan.plan.name} plan</dt>
          <dd className="mt-1">
            <span className="font-mono text-lg font-medium tabular-nums">{usagePct === null ? "∞" : `${usagePct}%`}</span>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-brand" style={{ width: `${usagePct ?? 4}%` }} />
            </div>
          </dd>
        </div>
      </dl>

      {forms.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>{canCreate ? "No forms yet" : "Nothing assigned to you yet"}</EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? "Create your first form from scratch or start with a template."
                : "When an admin or form manager gives you access to a form, it shows up here."}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate && (
          <EmptyContent>
            <NewFormDialog
              templates={templates}
              limitReached={limitReached}
              trigger={
                <Button>
                  <PlusIcon /> Create a form
                </Button>
              }
            />
          </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Responses</TableHead>
                <TableHead className="text-right">7d</TableHead>
                <TableHead className="text-right">Flows</TableHead>
                <TableHead>Last response</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((f) => {
                const level = levels.get(f.id) ?? "VIEW"
                const canEdit = levelAllows(level, "form.edit")
                return (
                <TableRow key={f.id}>
                  <TableCell className="pl-4">
                    <Link href={`/dashboard/forms/${f.id}/${canEdit ? "edit" : "submissions"}`} className="font-medium hover:underline">
                      {f.title}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">/f/{f.slug}</div>
                  </TableCell>
                  <TableCell className="text-xs capitalize text-muted-foreground">{f.mode.toLowerCase()}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[f.status]} className="capitalize">
                      {f.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    <Link href={`/dashboard/forms/${f.id}/submissions`} className="hover:underline">
                      {f._count.submissions}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground tabular-nums">{recent7.find((r) => r.formId === f.id)?._count._all ?? 0}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground tabular-nums">{f._count.automations}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{f.submissions[0] ? timeAgo(f.submissions[0].createdAt) : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{timeAgo(f.updatedAt)}</TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant={level === "MANAGE" ? "secondary" : "outline"} className="font-normal">
                          {LEVEL_LABELS[level]}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {f.createdById === user.id ? "You created this form" : `Created by ${f.createdBy?.name || f.createdBy?.email || "a former member"}`}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      {[
                        { href: `/dashboard/forms/${f.id}/edit`, label: "Edit", icon: PencilIcon, show: canEdit },
                        { href: `/dashboard/forms/${f.id}/submissions`, label: "Responses", icon: InboxIcon, show: true },
                        { href: `/dashboard/forms/${f.id}/analytics`, label: "Analytics", icon: BarChart3Icon, show: true },
                        { href: `/dashboard/forms/${f.id}/automations`, label: "Automations", icon: WorkflowIcon, show: levelAllows(level, "automations.manage") },
                      ].filter((a) => a.show).map((a) => (
                        <Tooltip key={a.label}>
                          <TooltipTrigger asChild>
                            <Button asChild variant="ghost" size="icon-sm">
                              <Link href={a.href} aria-label={a.label}>
                                <a.icon />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{a.label}</TooltipContent>
                        </Tooltip>
                      ))}
                      <FormRowActions
                        formId={f.id}
                        slug={f.slug}
                        title={f.title}
                        published={f.status === "PUBLISHED"}
                        can={{
                          edit: canEdit,
                          share: levelAllows(level, "form.share"),
                          duplicate: canCreate && levelAllows(level, "form.duplicate"),
                          delete: levelAllows(level, "form.delete"),
                          access: levelAllows(level, "form.access"),
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
