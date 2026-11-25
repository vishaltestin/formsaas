"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import { ArrowDownRightIcon, ArrowUpRightIcon, BarChart3Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { AnalyticsData, FieldBreakdown } from "@/lib/analytics"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

const trendConfig = {
  views: { label: "Views", color: "var(--chart-5)" },
  submissions: { label: "Submissions", color: "var(--chart-1)" },
} satisfies ChartConfig

const CHANNEL_LABEL: Record<string, string> = {
  DIRECT: "Direct link",
  IFRAME: "Inline iframe",
  SCRIPT: "Script embed",
  POPUP: "Popup",
  DRAWER: "Drawer",
}

const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.1 ? 1 : 0)}%`

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev && !now) return null
  if (!prev) return <span className="text-xs text-muted-foreground">new this period</span>
  const d = (now - prev) / prev
  const up = d >= 0
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs", up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
      {up ? <ArrowUpRightIcon className="size-3" /> : <ArrowDownRightIcon className="size-3" />}
      {Math.abs(d * 100).toFixed(0)}% vs prev.
    </span>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-medium tabular-nums">{value}</dd>
      <dd className="h-4">{hint}</dd>
    </div>
  )
}

function FieldCard({ f, total }: { f: FieldBreakdown; total: number }) {
  const max = Math.max(1, ...(f.options ?? []).map((o) => o.count))
  const sum = (f.options ?? []).reduce((a, o) => a + o.count, 0)
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm leading-snug">{f.label}</CardTitle>
        <CardDescription className="text-xs">
          {f.answered} of {total} answered
          {f.average !== undefined && f.kind !== "number" && ` · avg ${f.average.toFixed(1)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5 px-4">
        {f.kind === "nps" && f.nps && (
          <div className="flex items-baseline gap-3 pb-1">
            <span className="text-3xl font-semibold tabular-nums">{f.nps.score}</span>
            <span className="text-xs text-muted-foreground">
              NPS · {f.nps.promoters} promoters · {f.nps.passives} passives · {f.nps.detractors} detractors
            </span>
          </div>
        )}
        {(f.kind === "choice" || f.kind === "boolean") &&
          (f.options ?? []).map((o) => (
            <div key={o.label} className="space-y-1">
              <div className="flex justify-between gap-3 text-sm">
                <span className="truncate">{o.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {o.count} · {sum ? Math.round((o.count / sum) * 100) : 0}%
                </span>
              </div>
              <Progress value={(o.count / max) * 100} className="h-1.5" />
            </div>
          ))}
        {(f.kind === "rating" || f.kind === "nps") && (
          <ChartContainer config={{ count: { label: "Responses", color: "var(--chart-1)" } }} className="aspect-auto h-28 w-full">
            <BarChart data={f.options} margin={{ left: -24, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={40} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={3} />
            </BarChart>
          </ChartContainer>
        )}
        {f.kind === "number" && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Average", f.average],
              ["Min", f.min],
              ["Max", f.max],
            ].map(([l, v]) => (
              <div key={l as string} className="rounded-md bg-muted/60 py-2">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className="font-medium tabular-nums">{Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
              </div>
            ))}
          </div>
        )}
        {f.kind === "text" &&
          (f.samples?.length ? (
            <ul className="space-y-1.5">
              {f.samples.map((s, i) => (
                <li key={i} className="truncate rounded-md bg-muted/60 px-2.5 py-1.5 text-sm">
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No answers yet</p>
          ))}
      </CardContent>
    </Card>
  )
}

export function AnalyticsView({ data }: { data: AnalyticsData }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pending, start] = useTransition()
  const { kpis } = data
  const funnelTop = Math.max(1, data.funnel[0]?.sessions ?? 1)
  const deviceConfig: ChartConfig = Object.fromEntries(
    data.devices.map((d, i) => [d.device, { label: d.device.charAt(0).toUpperCase() + d.device.slice(1), color: `var(--chart-${(i % 5) + 1})` }])
  )

  return (
    <div className={cn("space-y-5 transition-opacity", pending && "opacity-60")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Unique sessions, last {data.range} days</p>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(data.range)}
          onValueChange={(v) => {
            if (!v) return
            const p = new URLSearchParams(sp.toString())
            p.set("range", v)
            start(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }))
          }}
        >
          <ToggleGroupItem value="7" className="px-3">7d</ToggleGroupItem>
          <ToggleGroupItem value="30" className="px-3">30d</ToggleGroupItem>
          <ToggleGroupItem value="90" className="px-3">90d</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-y rounded-lg border lg:grid-cols-5 lg:divide-y-0">
        <Kpi label="Views" value={kpis.views.toLocaleString()} hint={<Delta now={kpis.views} prev={kpis.prevViews} />} />
        <Kpi label="Starts" value={kpis.starts.toLocaleString()} hint={<span className="text-xs text-muted-foreground">{kpis.views ? pct(kpis.starts / kpis.views) : "0%"} of views</span>} />
        <Kpi label="Submissions" value={kpis.submissions.toLocaleString()} hint={<Delta now={kpis.submissions} prev={kpis.prevSubmissions} />} />
        <Kpi label="Conversion" value={pct(kpis.conversion)} hint={<span className="text-xs text-muted-foreground">{pct(kpis.completionRate)} of starts finish</span>} />
        <Kpi label="Avg. completion time" value={kpis.avgSeconds ? formatDuration(Math.round(kpis.avgSeconds)) : "—"} />
      </dl>

      <Card className="py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Traffic & responses</CardTitle>
        </CardHeader>
        <CardContent className="px-2">
          <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
            <AreaChart data={data.daily} margin={{ left: -12, right: 12, top: 8 }}>
              <defs>
                <linearGradient id="fillSubs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-submissions)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--color-submissions)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                fontSize={11}
                tickFormatter={(v: string) => new Date(v + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={40} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(v) => new Date(String(v) + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                  />
                }
              />
              <Area dataKey="views" type="monotone" stroke="var(--color-views)" fill="transparent" strokeWidth={1.5} strokeDasharray="4 3" />
              <Area dataKey="submissions" type="monotone" stroke="var(--color-submissions)" fill="url(#fillSubs)" strokeWidth={2} />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="py-4 lg:col-span-2">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Funnel</CardTitle>
            <CardDescription className="text-xs">Where respondents drop off</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 px-4">
            {data.funnel.map((s, i) => {
              const prev = i > 0 ? data.funnel[i - 1].sessions : null
              const drop = prev ? 1 - s.sessions / prev : 0
              return (
                <div key={s.label + i} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{s.label}</span>
                  <div className="h-6 overflow-hidden rounded bg-muted">
                    <div className="h-full rounded bg-[var(--chart-1)] transition-all" style={{ width: `${Math.max(1.5, (s.sessions / funnelTop) * 100)}%`, opacity: 1 - i * 0.08 }} />
                  </div>
                  <span className="w-28 text-right tabular-nums">
                    {s.sessions}
                    {prev !== null && prev > 0 && drop > 0 && <span className="ml-1.5 text-xs text-rose-600 dark:text-rose-400">−{Math.round(drop * 100)}%</span>}
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Devices</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            {data.devices.length ? (
              <ChartContainer config={deviceConfig} className="mx-auto aspect-square h-48">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="device" hideLabel />} />
                  <Pie data={data.devices} dataKey="count" nameKey="device" innerRadius={48} strokeWidth={2}>
                    {data.devices.map((d) => (
                      <Cell key={d.device} fill={`var(--color-${d.device})`} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="device" />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No submissions in range</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Channels</CardTitle>
            <CardDescription className="text-xs">Where the form was viewed and submitted</CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            {data.channels.length ? (
              <div className="space-y-2">
                {data.channels.map((c) => (
                  <div key={c.source} className="flex items-center justify-between gap-3 text-sm">
                    <span>{CHANNEL_LABEL[c.source] ?? c.source}</span>
                    <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
                      {c.views} views · {c.submissions} subs
                      <Badge variant="secondary" className="tabular-nums">{c.views ? pct(c.submissions / c.views) : "—"}</Badge>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No traffic in range</p>
            )}
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Top referrers</CardTitle>
            <CardDescription className="text-xs">Based on submissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-4">
            {data.referrers.length ? (
              data.referrers.map((r) => (
                <div key={r.host} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="truncate">{r.host}</span>
                    <span className="text-muted-foreground tabular-nums">{r.count}</span>
                  </div>
                  <Progress value={(r.count / Math.max(1, data.referrers[0].count)) * 100} className="h-1.5" />
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No submissions in range</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />
      <div>
        <h2 className="text-sm font-medium">Field breakdown</h2>
        <p className="text-xs text-muted-foreground">Answers from {kpis.submissions} submissions in this period</p>
      </div>
      {data.fields.length && kpis.submissions ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.fields.map((f) => (
            <FieldCard key={f.key} f={f} total={kpis.submissions} />
          ))}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BarChart3Icon />
            </EmptyMedia>
            <EmptyTitle>No answers to analyse</EmptyTitle>
            <EmptyDescription>Field-level charts appear once responses come in for this period.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
