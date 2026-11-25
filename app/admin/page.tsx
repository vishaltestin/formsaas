import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangleIcon, ArrowRightIcon, CheckCircle2Icon, ClockIcon, InboxIcon, WebhookIcon, WorkflowIcon } from "lucide-react"

import { ApiStatusBars, WorkspaceTrend } from "@/components/admin/overview-chart"
import { PageHeader } from "@/components/app/page-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, initials, timeAgo } from "@/lib/format"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/session"

export const metadata: Metadata = { title: "Admin overview" }

const DAY = 86400000

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** "$19/mo", "₹1,499 / month", "Free", "Custom" → monthly amount or null when not a fixed monthly price. */
function monthlyPrice(label: string): { amount: number; symbol: string } | null {
  const m = /([^\d\s]?)\s?([\d,]+(?:\.\d+)?)/.exec(label)
  if (!m) return null
  const amount = Number(m[2].replace(/,/g, ""))
  if (!Number.isFinite(amount) || amount <= 0) return null
  const yearly = /\/(\s)?(yr|year|annum)/i.test(label)
  return { amount: yearly ? amount / 12 : amount, symbol: m[1] || "$" }
}

export default async function AdminOverviewPage() {
  await requireAdmin()
  const now = new Date()
  const since30 = new Date(now.getTime() - 29 * DAY)
  since30.setUTCHours(0, 0, 0, 0)
  const since7 = new Date(now.getTime() - 7 * DAY)
  const prev30 = new Date(since30.getTime() - 30 * DAY)

  const [users, plans, subs, submissions, prevSubmissions, pending, failedRuns, runs7, webhookFails, webhook7, apiLogs, topForms, formCount] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true, createdAt: true, role: true }, orderBy: { createdAt: "desc" } }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.subscription.findMany({ include: { plan: true, user: { select: { id: true, name: true, email: true } } } }),
    prisma.submission.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true, formId: true } }),
    prisma.submission.count({ where: { createdAt: { gte: prev30, lt: since30 } } }),
    prisma.upgradeRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 5,
      include: { user: { select: { name: true, email: true } }, requestedPlan: { select: { name: true } } },
    }),
    prisma.automationRun.findMany({
      where: { status: "FAILED", startedAt: { gte: since7 }, isTest: false },
      orderBy: { startedAt: "desc" },
      take: 4,
      select: { id: true, error: true, startedAt: true, automation: { select: { id: true, name: true } } },
    }),
    prisma.automationRun.count({ where: { startedAt: { gte: since7 }, isTest: false } }),
    prisma.webhookDelivery.count({ where: { success: false, createdAt: { gte: since7 } } }),
    prisma.webhookDelivery.count({ where: { createdAt: { gte: since7 } } }),
    prisma.apiRequestLog.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 13 * DAY) } }, select: { createdAt: true, status: true, durationMs: true } }),
    prisma.submission.groupBy({ by: ["formId"], where: { createdAt: { gte: since30 } }, _count: { _all: true }, orderBy: { _count: { formId: "desc" } }, take: 5 }),
    prisma.form.count(),
  ])

  // ── subscriptions ─────────────────────────────────────────
  const free = plans.find((p) => p.slug === "free")
  const effective = subs.filter((s) => s.status === "ACTIVE" && (!s.expiresAt || s.expiresAt > now) && s.plan.isActive)
  const effectiveByUser = new Map(effective.map((s) => [s.userId, s]))
  const planCounts = new Map<string, number>()
  for (const u of users) {
    const name = effectiveByUser.get(u.id)?.plan.name ?? free?.name ?? "Free"
    planCounts.set(name, (planCounts.get(name) ?? 0) + 1)
  }
  const distribution = plans.map((p) => ({ name: p.name, count: planCounts.get(p.name) ?? 0, price: p.priceLabel }))
  const paid = effective.filter((s) => s.plan.slug !== "free")
  let mrr = 0
  let mrrSymbol = "$"
  let mrrKnown = 0
  for (const s of paid) {
    const p = monthlyPrice(s.plan.priceLabel)
    if (p) {
      mrr += p.amount
      mrrSymbol = p.symbol
      mrrKnown++
    }
  }
  const expiring = effective
    .filter((s) => s.expiresAt && s.expiresAt.getTime() - now.getTime() < 14 * DAY)
    .sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime())

  // ── activity trend ────────────────────────────────────────
  const days: { date: string; submissions: number; signups: number }[] = []
  for (let i = 0; i < 30; i++) days.push({ date: isoDay(new Date(since30.getTime() + i * DAY)), submissions: 0, signups: 0 })
  const idx = new Map(days.map((d, i) => [d.date, i]))
  for (const s of submissions) {
    const i = idx.get(isoDay(s.createdAt))
    if (i !== undefined) days[i].submissions++
  }
  let signups30 = 0
  for (const u of users) {
    const i = idx.get(isoDay(u.createdAt))
    if (i !== undefined) {
      days[i].signups++
      signups30++
    }
  }
  const delta = prevSubmissions ? Math.round(((submissions.length - prevSubmissions) / prevSubmissions) * 100) : null

  // ── API health ───────────────────────────────────────────
  const apiDays: { date: string; ok: number; client: number; server: number }[] = []
  for (let i = 13; i >= 0; i--) apiDays.push({ date: isoDay(new Date(now.getTime() - i * DAY)), ok: 0, client: 0, server: 0 })
  const apiIdx = new Map(apiDays.map((d, i) => [d.date, i]))
  const durations: number[] = []
  for (const l of apiLogs) {
    const i = apiIdx.get(isoDay(l.createdAt))
    if (i === undefined) continue
    if (l.status >= 500) apiDays[i].server++
    else if (l.status >= 400) apiDays[i].client++
    else apiDays[i].ok++
    durations.push(l.durationMs)
  }
  durations.sort((a, b) => a - b)
  const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : null
  const serverErrors = apiDays.reduce((n, d) => n + d.server, 0)
  const errorRate = apiLogs.length ? (serverErrors / apiLogs.length) * 100 : 0

  const formTitles = new Map(
    (await prisma.form.findMany({ where: { id: { in: topForms.map((t) => t.formId) } }, select: { id: true, title: true, user: { select: { email: true } } } })).map((f) => [f.id, f])
  )
  const maxTop = Math.max(1, ...topForms.map((t) => t._count._all))

  const attention = pending.length + expiring.length + failedRuns.length + (webhookFails > 0 ? 1 : 0)

  const ledger = [
    { label: "Accounts", value: users.length.toLocaleString(), hint: `${signups30} new in 30 days` },
    { label: "Paid subscriptions", value: paid.length.toLocaleString(), hint: users.length ? `${Math.round((paid.length / users.length) * 100)}% of accounts` : "—" },
    {
      label: "Est. monthly revenue",
      value: mrrKnown ? `${mrrSymbol}${Math.round(mrr).toLocaleString()}` : "—",
      hint: mrrKnown ? "From plan price labels" : "Plans have no fixed price",
    },
    {
      label: "Responses · 30 days",
      value: submissions.length.toLocaleString(),
      hint: delta === null ? `${formCount} forms in workspace` : `${delta >= 0 ? "+" : ""}${delta}% vs previous 30 days`,
    },
  ]

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Overview"
        description={`Workspace health as of ${formatDate(now, { dateStyle: "medium" })}.`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/users">
              Manage users <ArrowRightIcon />
            </Link>
          </Button>
        }
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
        {ledger.map((s) => (
          <div key={s.label} className="bg-card px-4 py-3.5">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 font-mono text-xl font-medium tracking-tight tabular-nums">{s.value}</dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">{s.hint}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Activity</CardTitle>
            <CardDescription className="text-xs">Daily responses across all forms, with new sign-ups on the right axis.</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            <WorkspaceTrend data={days} />
          </CardContent>
        </Card>

        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Plan mix</CardTitle>
            <CardDescription className="text-xs">Effective plan per account, after expiry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label="Plan distribution">
              {distribution.map((d, i) =>
                d.count ? (
                  <div key={d.name} style={{ width: `${(d.count / Math.max(1, users.length)) * 100}%`, background: `var(--chart-${(i % 5) + 1})` }} className="h-full" />
                ) : null
              )}
            </div>
            <ul className="space-y-2.5">
              {distribution.map((d, i) => (
                <li key={d.name} className="flex items-center gap-2.5 text-sm">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: `var(--chart-${(i % 5) + 1})` }} />
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-muted-foreground">{d.price}</span>
                  <span className="ml-auto font-mono text-sm tabular-nums">{d.count}</span>
                  <span className="w-10 text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {users.length ? Math.round((d.count / users.length) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3.5 [.border-b]:pb-3.5">
            <CardTitle className="flex items-center gap-2 text-sm">
              Needs attention
              {attention > 0 ? (
                <Badge className="bg-warm font-mono text-warm-foreground tabular-nums">{attention}</Badge>
              ) : (
                <Badge variant="secondary">All clear</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">Oldest first. Resolve requests and renewals before access lapses.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {attention === 0 ? (
              <div className="flex items-center gap-3 px-4 py-8 text-sm text-muted-foreground">
                <CheckCircle2Icon className="size-5 text-primary" />
                No pending requests, expiring plans or failing integrations.
              </div>
            ) : (
              <ul className="divide-y">
                {pending.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warm-soft text-warm-foreground">
                      <InboxIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium">{r.user.name ?? r.user.email}</span> requested <span className="font-medium">{r.requestedPlan.name}</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.user.email} · waiting {timeAgo(r.createdAt).replace(" ago", "")}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline" className="h-7">
                      <Link href="/admin/requests">Review</Link>
                    </Button>
                  </li>
                ))}
                {expiring.map((s) => {
                  const daysLeft = Math.max(0, Math.ceil((s.expiresAt!.getTime() - now.getTime()) / DAY))
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                        <ClockIcon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <span className="font-medium">{s.user.name ?? s.user.email}</span>’s {s.plan.name} plan expires{" "}
                          {daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.user.email} · {formatDate(s.expiresAt!)}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline" className="h-7">
                        <Link href={`/admin/users?q=${encodeURIComponent(s.user.email)}`}>Extend</Link>
                      </Button>
                    </li>
                  )
                })}
                {failedRuns.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                      <WorkflowIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        Automation <span className="font-medium">{r.automation.name}</span> failed
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {timeAgo(r.startedAt)} · {r.error ?? "See run history for details"}
                      </p>
                    </div>
                  </li>
                ))}
                {webhookFails > 0 && (
                  <li className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                      <WebhookIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-mono tabular-nums">{webhookFails}</span> of <span className="font-mono tabular-nums">{webhook7}</span> webhook deliveries failed this week
                      </p>
                      <p className="truncate text-xs text-muted-foreground">Endpoints returned errors or timed out. Owners can retry from Integrations.</p>
                    </div>
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Developer API</CardTitle>
            <CardDescription className="text-xs">Requests per day, last 14 days.</CardDescription>
            <CardAction>
              {errorRate >= 1 ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangleIcon /> {errorRate.toFixed(1)}% 5xx
                </Badge>
              ) : (
                <Badge variant="secondary">Healthy</Badge>
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3 px-4">
            <ApiStatusBars data={apiDays} />
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Requests</dt>
                <dd className="font-mono text-sm tabular-nums">{apiLogs.length.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">p95 latency</dt>
                <dd className="font-mono text-sm tabular-nums">{p95 === null ? "—" : `${p95} ms`}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Automation runs</dt>
                <dd className="font-mono text-sm tabular-nums">{runs7} / 7d</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3.5 [.border-b]:pb-3.5">
            <CardTitle className="text-sm">Busiest forms</CardTitle>
            <CardDescription className="text-xs">By responses in the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {topForms.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No responses in the last 30 days.</p>
            ) : (
              <ul className="divide-y">
                {topForms.map((t) => {
                  const f = formTitles.get(t.formId)
                  return (
                    <li key={t.formId} className="relative px-4 py-2.5">
                      <div className="absolute inset-y-1 left-0 rounded-r bg-accent" style={{ width: `${(t._count._all / maxTop) * 100}%` }} aria-hidden />
                      <div className="relative flex items-center gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium">{f?.title ?? "Deleted form"}</span>
                        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{f?.user.email}</span>
                        <span className="font-mono tabular-nums">{t._count._all}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-3.5 [.border-b]:pb-3.5">
            <CardTitle className="text-sm">Newest accounts</CardTitle>
            <CardAction>
              <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                <Link href="/admin/users">All users</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Account</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="pr-4 text-right">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.slice(0, 5).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-7">
                          <AvatarFallback className="text-[11px]">{initials(u.name, u.email)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{u.name ?? "—"}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {effectiveByUser.get(u.id)?.plan.name ?? free?.name ?? "Free"}
                      </Badge>
                      {u.role === "ADMIN" && (
                        <Badge variant="secondary" className="ml-1 font-normal">
                          Admin
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-right text-xs text-muted-foreground">{timeAgo(u.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
