import { NodeExecutionError, executeNode, type ExecEnv } from "./executors"
import { triggerOf } from "./graph"
import type { Scope } from "./template"
import type { AutomationGraph, StepStatus } from "./types"

/** Persistable execution cursor stored in AutomationRun.context. */
export interface RunState {
  nodes: Record<string, unknown>
  queue: string[]
  executed: string[]
  waitingNodeId?: string | null
}

export interface StepRecord {
  nodeId: string
  nodeType: string
  label: string
  status: StepStatus
  input?: unknown
  output?: unknown
  error?: string | null
  attempt: number
  startedAt: Date
  finishedAt: Date | null
  durationMs: number | null
  /** True when this record completes a previously WAITING step */
  resumed?: boolean
}

export type EngineOutcome =
  | { status: "SUCCEEDED" }
  | { status: "FAILED"; error: string; nodeId: string }
  | { status: "WAITING_APPROVAL"; nodeId: string }
  | { status: "WAITING_DELAY"; nodeId: string; resumeAt: Date }

export interface ResumeInput {
  nodeId: string
  output: unknown
  branch?: string
}

const MAX_STEPS = 250

export function emptyState(): RunState {
  return { nodes: {}, queue: [], executed: [], waitingNodeId: null }
}

export function normalizeState(raw: unknown): RunState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<RunState>
  return {
    nodes: r.nodes && typeof r.nodes === "object" ? (r.nodes as Record<string, unknown>) : {},
    queue: Array.isArray(r.queue) ? r.queue.filter((x): x is string => typeof x === "string") : [],
    executed: Array.isArray(r.executed) ? r.executed.filter((x): x is string => typeof x === "string") : [],
    waitingNodeId: typeof r.waitingNodeId === "string" ? r.waitingNodeId : null,
  }
}

function children(graph: AutomationGraph, nodeId: string, branch?: string) {
  return graph.edges.filter((e) => e.source === nodeId && (branch === undefined || e.sourceHandle === branch)).map((e) => e.target)
}

/**
 * Walks the DAG from the trigger (or from a resume point), executing each
 * reachable node at most once. Branching nodes only follow the matching
 * handle. Pausing nodes (approval/delay) stop the walk and return a cursor
 * that can be resumed later — the queue is persisted with the run.
 */
export async function advanceGraph(
  graph: AutomationGraph,
  initial: RunState,
  scopeBase: Scope,
  env: ExecEnv,
  onStep: (step: StepRecord) => Promise<void> | void,
  resume?: ResumeInput
): Promise<{ state: RunState; outcome: EngineOutcome }> {
  const state: RunState = { nodes: { ...initial.nodes }, queue: [...initial.queue], executed: [...initial.executed], waitingNodeId: initial.waitingNodeId ?? null }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))

  if (resume) {
    const node = byId.get(resume.nodeId)
    if (!node) return { state, outcome: { status: "FAILED", error: `Step ${resume.nodeId} no longer exists`, nodeId: resume.nodeId } }
    const prev = state.nodes[resume.nodeId]
    state.nodes[resume.nodeId] = prev && typeof prev === "object" && resume.output && typeof resume.output === "object" ? { ...prev, ...resume.output } : resume.output
    state.executed.push(resume.nodeId)
    state.waitingNodeId = null
    const now = new Date()
    await onStep({ nodeId: node.id, nodeType: node.type, label: node.data.label, status: "SUCCEEDED", output: state.nodes[resume.nodeId], attempt: 1, startedAt: now, finishedAt: now, durationMs: null, resumed: true })
    state.queue.push(...children(graph, node.id, resume.branch))
  } else if (state.executed.length === 0 && state.queue.length === 0) {
    const trigger = triggerOf(graph)
    if (!trigger) return { state, outcome: { status: "FAILED", error: "Automation has no trigger", nodeId: "" } }
    state.queue.push(trigger.id)
  }

  let steps = 0
  while (state.queue.length > 0) {
    if (++steps > MAX_STEPS) return { state, outcome: { status: "FAILED", error: `Exceeded ${MAX_STEPS} steps`, nodeId: state.queue[0] } }
    const id = state.queue.shift()!
    if (state.executed.includes(id)) continue
    const node = byId.get(id)
    if (!node) continue
    const startedAt = new Date()
    const t0 = performance.now()
    try {
      const res = await executeNode(node, { ...scopeBase, nodes: state.nodes }, env)
      const durationMs = Math.round(performance.now() - t0)
      if ("pause" in res) {
        state.waitingNodeId = id
        if (res.output !== undefined) state.nodes[id] = res.output
        await onStep({
          nodeId: id,
          nodeType: node.type,
          label: node.data.label,
          status: "WAITING",
          input: res.input,
          output: res.pause.kind === "delay" ? { resumeAt: res.pause.resumeAt.toISOString(), waitMs: res.pause.waitMs } : res.output,
          attempt: 1,
          startedAt,
          finishedAt: null,
          durationMs,
        })
        return {
          state,
          outcome: res.pause.kind === "approval" ? { status: "WAITING_APPROVAL", nodeId: id } : { status: "WAITING_DELAY", nodeId: id, resumeAt: res.pause.resumeAt },
        }
      }
      state.nodes[id] = res.output
      state.executed.push(id)
      await onStep({ nodeId: id, nodeType: node.type, label: node.data.label, status: "SUCCEEDED", input: res.input, output: res.output, attempt: res.attempts ?? 1, startedAt, finishedAt: new Date(), durationMs })
      state.queue.push(...children(graph, id, res.branch))
    } catch (e) {
      const durationMs = Math.round(performance.now() - t0)
      const message = e instanceof Error ? e.message : "Step failed"
      const err = e instanceof NodeExecutionError ? e : null
      state.nodes[id] = { error: message, ...(err?.output && typeof err.output === "object" ? (err.output as object) : {}) }
      state.executed.push(id)
      await onStep({ nodeId: id, nodeType: node.type, label: node.data.label, status: "FAILED", input: err?.input, output: err?.output, error: message, attempt: err?.attempts ?? 1, startedAt, finishedAt: new Date(), durationMs })
      if (!node.data.continueOnError) return { state, outcome: { status: "FAILED", error: `${node.data.label}: ${message}`, nodeId: id } }
      // Continue down non-branch edges only.
      state.queue.push(...children(graph, id).filter((t) => graph.edges.some((ed) => ed.source === id && ed.target === t && !ed.sourceHandle)))
    }
  }
  return { state, outcome: { status: "SUCCEEDED" } }
}
