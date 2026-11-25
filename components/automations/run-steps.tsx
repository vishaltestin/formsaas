"use client"

import { useState } from "react"
import { ChevronRightIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { RunStepView, RunView } from "@/lib/automations/view"
import { cn } from "@/lib/utils"

import { NODE_ICONS } from "./node-meta"

export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  if (value === undefined || value === null) return <p className="text-xs text-muted-foreground">—</p>
  return (
    <pre className={cn("max-h-72 overflow-auto rounded-md border bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all", className)}>
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    SUCCEEDED: "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    FAILED: "border-destructive/30 bg-destructive/10 text-destructive",
    WAITING_APPROVAL: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    WAITING_DELAY: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    WAITING: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    RUNNING: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  }
  const label: Record<string, string> = { WAITING_APPROVAL: "awaiting approval", WAITING_DELAY: "delayed", WAITING: "waiting" }
  return (
    <Badge variant="outline" className={cn("font-normal", map[status])}>
      {label[status] ?? status.toLowerCase()}
    </Badge>
  )
}

const STATUS_DOT: Record<string, string> = {
  SUCCEEDED: "bg-emerald-500",
  FAILED: "bg-destructive",
  WAITING: "bg-amber-500",
  SKIPPED: "bg-muted-foreground/40",
}

function StepRow({ step, defaultOpen }: { step: RunStepView; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const Icon = NODE_ICONS[step.nodeType as keyof typeof NODE_ICONS] ?? ChevronRightIcon
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40">
        <ChevronRightIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-medium">{step.label}</span>
        <code className="hidden shrink-0 font-mono text-[10px] text-muted-foreground @sm:inline">{step.nodeId}</code>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {step.attempt > 1 && <span className="font-mono text-[10px] text-muted-foreground tabular-nums">×{step.attempt}</span>}
          <span className="text-right font-mono text-[11px] text-muted-foreground tabular-nums @sm:w-14">{step.durationMs !== null ? `${step.durationMs}ms` : "—"}</span>
          <span className="@md:hidden" title={step.status.toLowerCase()}>
            <span className={cn("block size-2 rounded-full", STATUS_DOT[step.status] ?? "bg-muted-foreground")} />
          </span>
          <span className="hidden @md:inline-flex">
            <RunStatusBadge status={step.status} />
          </span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-3 pb-3">
        {step.error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 font-mono text-xs text-destructive">{step.error}</p>}
        <div className="grid gap-2 @xl:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground uppercase">Input</p>
            <JsonBlock value={step.input} />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground uppercase">Output</p>
            <JsonBlock value={step.output} />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function RunSteps({ run, focusNodeId }: { run: RunView; focusNodeId?: string | null }) {
  return (
    <div className="@container min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <RunStatusBadge status={run.status} />
        {run.isTest && <Badge variant="secondary">test</Badge>}
        <span className="max-w-full truncate font-mono tabular-nums">{run.id}</span>
        <span className="font-mono tabular-nums">{run.durationMs !== null ? `${run.durationMs}ms` : "in progress"}</span>
        {run.resumeAt && <span>resumes {new Date(run.resumeAt).toLocaleString()}</span>}
      </div>
      {run.error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{run.error}</p>}
      <div className="rounded-md border">
        {run.steps.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">No steps executed.</p>
        ) : (
          run.steps.map((s) => <StepRow key={s.id} step={s} defaultOpen={focusNodeId ? s.nodeId === focusNodeId : s.status === "FAILED"} />)
        )}
      </div>
      <Collapsible>
        <CollapsibleTrigger className="text-xs text-muted-foreground underline-offset-4 hover:underline">Trigger payload</CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <JsonBlock value={run.triggerData} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
