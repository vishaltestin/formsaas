"use client"

import { useState } from "react"
import { ActivityIcon } from "lucide-react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

export interface RequestLogRow {
  id: string
  method: string
  path: string
  status: number
  durationMs: number
  keyPrefix: string | null
  error: string | null
  createdAt: string
}

export function statusClass(status: number) {
  if (status >= 500) return "text-destructive"
  if (status >= 400) return "text-amber-700 dark:text-amber-400"
  return "text-emerald-700 dark:text-emerald-400"
}

export function RequestLogs({ logs }: { logs: RequestLogRow[] }) {
  const [filter, setFilter] = useState("all")
  const rows = logs.filter((l) => filter === "all" || (filter === "2xx" ? l.status < 300 : filter === "4xx" ? l.status >= 400 && l.status < 500 : l.status >= 500))
  const p = (q: number) => {
    const sorted = logs.map((l) => l.durationMs).sort((a, b) => a - b)
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0
  }
  const errors = logs.filter((l) => l.status >= 400).length

  if (logs.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ActivityIcon />
          </EmptyMedia>
          <EmptyTitle>No API requests yet</EmptyTitle>
          <EmptyDescription>Every authenticated request to /api/v1 is logged here with status and latency.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="flex divide-x rounded-md border text-xs">
          {[
            ["Requests", logs.length],
            ["Errors", errors],
            ["p50", `${p(0.5)}ms`],
            ["p95", `${p(0.95)}ms`],
          ].map(([k, v]) => (
            <div key={k} className="px-3 py-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-mono text-sm tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(v) => v && setFilter(v)}>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="2xx">2xx</ToggleGroupItem>
          <ToggleGroupItem value="4xx">4xx</ToggleGroupItem>
          <ToggleGroupItem value="5xx">5xx</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-20">Method</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Key</TableHead>
              <TableHead className="text-right">Latency</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => (
              <TableRow key={l.id} title={l.error ?? undefined}>
                <TableCell className={cn("font-mono text-xs tabular-nums", statusClass(l.status))}>{l.status}</TableCell>
                <TableCell className="font-mono text-xs">{l.method}</TableCell>
                <TableCell className="max-w-96 font-mono text-xs">
                  <span className="block truncate">{l.path}</span>
                  {l.error && <span className="block truncate text-[11px] text-muted-foreground">{l.error}</span>}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.keyPrefix ? `${l.keyPrefix}…` : "—"}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{l.durationMs}ms</TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
