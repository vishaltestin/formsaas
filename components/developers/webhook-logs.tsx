"use client"

import { useState } from "react"
import { WebhookIcon } from "lucide-react"

import { JsonBlock } from "@/components/automations/run-steps"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { statusClass } from "./request-logs"

export interface DeliveryRow {
  id: string
  event: string
  url: string
  formTitle: string
  statusCode: number | null
  success: boolean
  responseMs: number | null
  attempt: number
  error: string | null
  payload: unknown
  responseBody: string | null
  createdAt: string
}

export function WebhookLogs({ deliveries }: { deliveries: DeliveryRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = deliveries.find((d) => d.id === openId) ?? null
  if (deliveries.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WebhookIcon />
          </EmptyMedia>
          <EmptyTitle>No webhook deliveries yet</EmptyTitle>
          <EmptyDescription>Add a webhook in a form&apos;s Integrations tab. Each signed delivery attempt is logged here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Status</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Form</TableHead>
              <TableHead className="text-right">Attempt</TableHead>
              <TableHead className="text-right">Latency</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((d) => (
              <TableRow key={d.id} className="cursor-pointer" onClick={() => setOpenId(d.id)}>
                <TableCell className={cn("font-mono text-xs tabular-nums", d.statusCode ? statusClass(d.statusCode) : "text-destructive")}>{d.statusCode ?? "ERR"}</TableCell>
                <TableCell className="font-mono text-xs">{d.event}</TableCell>
                <TableCell className="max-w-72 truncate font-mono text-xs text-muted-foreground">{d.url}</TableCell>
                <TableCell className="max-w-48 truncate text-xs">{d.formTitle}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{d.attempt}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{d.responseMs !== null ? `${d.responseMs}ms` : "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Delivery</SheetTitle>
            <SheetDescription className="font-mono text-xs break-all">{open?.url}</SheetDescription>
          </SheetHeader>
          {open && (
            <div className="space-y-4 px-4 pb-6">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={open.success ? "secondary" : "destructive"}>{open.success ? "delivered" : "failed"}</Badge>
                <span className="font-mono tabular-nums">HTTP {open.statusCode ?? "—"}</span>
                <span className="font-mono tabular-nums">{open.responseMs ?? 0}ms</span>
                <span className="font-mono tabular-nums">attempt {open.attempt}</span>
              </div>
              {open.error && <p className="font-mono text-xs text-destructive">{open.error}</p>}
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted-foreground uppercase">Payload</p>
                <JsonBlock value={open.payload} />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted-foreground uppercase">Response body</p>
                <pre className="max-h-60 overflow-auto rounded-md border bg-muted/40 p-2.5 font-mono text-[11px] whitespace-pre-wrap break-all">{open.responseBody || "—"}</pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
