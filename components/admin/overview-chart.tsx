"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

const trendConfig = {
  submissions: { label: "Responses", color: "var(--chart-1)" },
  signups: { label: "Sign-ups", color: "var(--chart-2)" },
} satisfies ChartConfig

const day = (v: string, opts: Intl.DateTimeFormatOptions) => new Date(v + "T00:00:00Z").toLocaleDateString(undefined, { ...opts, timeZone: "UTC" })

export function WorkspaceTrend({ data }: { data: { date: string; submissions: number; signups: number }[] }) {
  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-60 w-full">
      <AreaChart data={data} margin={{ left: -12, right: 12, top: 8 }}>
        <defs>
          <linearGradient id="adminFillSubs" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-submissions)" stopOpacity={0.22} />
            <stop offset="95%" stopColor="var(--color-submissions)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} fontSize={11} tickFormatter={(v: string) => day(v, { month: "short", day: "numeric" })} />
        <YAxis yAxisId="l" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={40} />
        <YAxis yAxisId="r" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={28} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" labelFormatter={(v) => day(String(v), { weekday: "short", month: "short", day: "numeric" })} />} />
        <Area yAxisId="l" dataKey="submissions" type="monotone" stroke="var(--color-submissions)" fill="url(#adminFillSubs)" strokeWidth={2} />
        <Area yAxisId="r" dataKey="signups" type="step" stroke="var(--color-signups)" fill="transparent" strokeWidth={1.75} />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}

export function ApiStatusBars({ data }: { data: { date: string; ok: number; client: number; server: number }[] }) {
  const config = {
    ok: { label: "2xx", color: "var(--chart-1)" },
    client: { label: "4xx", color: "var(--chart-2)" },
    server: { label: "5xx", color: "var(--destructive)" },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-32 w-full">
      <BarChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <XAxis dataKey="date" hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(v) => day(String(v), { weekday: "short", month: "short", day: "numeric" })} />} />
        <Bar dataKey="ok" stackId="a" fill="var(--color-ok)" />
        <Bar dataKey="client" stackId="a" fill="var(--color-client)" />
        <Bar dataKey="server" stackId="a" fill="var(--color-server)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
