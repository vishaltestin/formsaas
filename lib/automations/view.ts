import type { AutomationRun, AutomationRunStep } from "@/generated/prisma/client"

export interface RunStepView {
  id: string
  nodeId: string
  nodeType: string
  label: string
  status: string
  input: unknown
  output: unknown
  error: string | null
  attempt: number
  startedAt: string
  durationMs: number | null
}

export interface RunView {
  id: string
  status: string
  isTest: boolean
  triggerType: string
  triggerData: unknown
  submissionId: string | null
  error: string | null
  waitingNodeId: string | null
  resumeAt: string | null
  replayOfId: string | null
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  steps: RunStepView[]
}

export function toRunView(run: AutomationRun & { steps?: AutomationRunStep[] }): RunView {
  return {
    id: run.id,
    status: run.status,
    isTest: run.isTest,
    triggerType: run.triggerType,
    triggerData: run.triggerData,
    submissionId: run.submissionId,
    error: run.error,
    waitingNodeId: run.waitingNodeId,
    resumeAt: run.resumeAt?.toISOString() ?? null,
    replayOfId: run.replayOfId,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    steps: (run.steps ?? []).map((s) => ({
      id: s.id,
      nodeId: s.nodeId,
      nodeType: s.nodeType,
      label: s.label,
      status: s.status,
      input: s.input,
      output: s.output,
      error: s.error,
      attempt: s.attempt,
      startedAt: s.startedAt.toISOString(),
      durationMs: s.durationMs,
    })),
  }
}
