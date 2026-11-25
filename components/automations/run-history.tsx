"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckIcon, ChevronDownIcon, HistoryIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { cancelAutomationRun, decideAutomationApproval, replayAutomationRun } from "@/app/actions/automations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TRIGGER_LABELS, type TriggerKind } from "@/lib/automations/types"
import type { RunView } from "@/lib/automations/view"

import { RunStatusBadge, RunSteps } from "./run-steps"

function relTime(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export function RunActions({ run, formId, onUpdated }: { run: RunView; formId: string; onUpdated: (run: RunView) => void }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const replay = (mode: "latest" | "snapshot") =>
    startTransition(async () => {
      const res = await replayAutomationRun(run.id, mode)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Replay ${res.data.status === "SUCCEEDED" ? "succeeded" : res.data.status.toLowerCase().replace("_", " ")}`)
      onUpdated(res.data)
      router.refresh()
    })
  const decide = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const res = await decideAutomationApproval(run.id, decision)
      if (!res.ok) return void toast.error(res.error)
      toast.success(decision === "approved" ? "Approved" : "Rejected")
      onUpdated(res.data)
      router.refresh()
    })
  const cancel = () =>
    startTransition(async () => {
      const res = await cancelAutomationRun(run.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Run cancelled")
      router.refresh()
    })
  return (
    <div className="flex items-center justify-end gap-1">
      {run.status === "WAITING_APPROVAL" && (
        <>
          <Button size="xs" variant="outline" disabled={pending} onClick={() => decide("approved")}>
            <CheckIcon data-icon="inline-start" /> Approve
          </Button>
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => decide("rejected")}>
            <XIcon data-icon="inline-start" /> Reject
          </Button>
        </>
      )}
      {(run.status === "WAITING_DELAY" || run.status === "WAITING_APPROVAL") && (
        <Button size="xs" variant="ghost" disabled={pending} onClick={cancel}>
          Cancel
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="xs" variant="ghost" disabled={pending} aria-label="Replay run">
            <RotateCcwIcon data-icon="inline-start" /> Replay <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => replay("latest")}>With the current automation</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => replay("snapshot")}>With the original snapshot</DropdownMenuItem>
          {run.submissionId && (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/forms/${formId}/submissions?id=${run.submissionId}`}>Open submission</Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function RunHistory({ runs, formId, initialRunId }: { runs: RunView[]; formId: string; initialRunId: string | null }) {
  const [openId, setOpenId] = useState<string | null>(initialRunId && runs.some((r) => r.id === initialRunId) ? initialRunId : null)
  const [override, setOverride] = useState<Record<string, RunView>>({})
  const open = openId ? (override[openId] ?? runs.find((r) => r.id === openId) ?? null) : null

  if (runs.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HistoryIcon />
          </EmptyMedia>
          <EmptyTitle>No runs yet</EmptyTitle>
          <EmptyDescription>Runs appear here when the trigger fires, when you test on the canvas, or when you replay a run.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Status</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Run</TableHead>
              <TableHead className="text-right">Steps</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <RunStatusBadge status={r.status} />
                    {r.isTest && <Badge variant="secondary">test</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {TRIGGER_LABELS[r.triggerType as TriggerKind] ?? r.triggerType}
                  {r.replayOfId && <span className="ml-1.5 text-xs text-muted-foreground">replay</span>}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">{r.id.slice(-10)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{r.steps.length}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{r.durationMs !== null ? `${r.durationMs}ms` : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground" title={new Date(r.startedAt).toLocaleString()}>
                  {relTime(r.startedAt)}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <RunActions run={override[r.id] ?? r} formId={formId} onUpdated={(nr) => (setOverride((o) => ({ ...o, [nr.id]: nr })), setOpenId(nr.id))} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Run details</SheetTitle>
            <SheetDescription>{open ? `${TRIGGER_LABELS[open.triggerType as TriggerKind] ?? open.triggerType} · ${new Date(open.startedAt).toLocaleString()}` : ""}</SheetDescription>
          </SheetHeader>
          {open && (
            <div className="space-y-4 px-4 pb-6">
              <RunActions run={open} formId={formId} onUpdated={(nr) => (setOverride((o) => ({ ...o, [nr.id]: nr })), setOpenId(nr.id))} />
              <RunSteps run={open} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
