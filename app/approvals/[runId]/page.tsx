import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ApprovalDecision } from "@/components/automations/approval-decision"
import { Logo } from "@/components/app/logo"
import { Badge } from "@/components/ui/badge"
import { verifyApprovalSignature, type TriggerData } from "@/lib/automations/runner"
import { prisma } from "@/lib/prisma"

export const metadata: Metadata = { title: { absolute: "Approval request" }, robots: { index: false } }

export default async function ApprovalPage(props: PageProps<"/approvals/[runId]">) {
  const { runId } = await props.params
  const sp = await props.searchParams
  const node = typeof sp.node === "string" ? sp.node : ""
  const sig = typeof sp.sig === "string" ? sp.sig : ""
  if (!verifyApprovalSignature(runId, node, sig)) notFound()

  const run = await prisma.automationRun.findUnique({ where: { id: runId }, include: { automation: { select: { name: true } }, steps: { where: { nodeId: node }, orderBy: { startedAt: "desc" }, take: 1 } } })
  if (!run) notFound()
  const trigger = run.triggerData as TriggerData
  const step = run.steps[0]
  const message = (step?.input as { message?: string } | null)?.message
  const pending = run.status === "WAITING_APPROVAL" && run.waitingNodeId === node
  const entries = Object.entries(trigger.data ?? {}).slice(0, 40)

  return (
    <main className="min-h-svh bg-muted/30 px-4 py-10">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <Logo />
        <section className="rounded-lg border bg-background">
          <header className="border-b px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-base font-semibold tracking-tight">Approval requested</h1>
              <Badge variant={pending ? "default" : "secondary"}>{pending ? "Pending" : run.status.replace("_", " ").toLowerCase()}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {run.automation.name} · {trigger.form?.title} · <span className="font-mono tabular-nums">{run.id.slice(-8)}</span>
            </p>
          </header>
          {message && <p className="border-b px-5 py-3 text-sm">{message}</p>}
          <dl className="divide-y text-sm">
            {entries.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[40%_1fr] gap-3 px-5 py-2">
                <dt className="truncate font-mono text-xs text-muted-foreground">{k}</dt>
                <dd className="break-words">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t px-5 py-4">
            {pending ? (
              <ApprovalDecision runId={run.id} nodeId={node} sig={sig} />
            ) : (
              <p className="text-sm text-muted-foreground">This request has already been decided — no further action is needed.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
