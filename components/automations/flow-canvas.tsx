"use client"

import "@xyflow/react/dist/style.css"

import { createContext, useCallback, useContext } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChangeset,
  type Node,
  type NodeChangeset,
  type NodeProps,
} from "@xyflow/react"
import { AlertCircleIcon, CheckIcon, Loader2Icon, PauseIcon, XIcon } from "lucide-react"

import { wouldCreateCycle } from "@/lib/automations/graph"
import { BRANCH_HANDLES, type AutomationGraph, type AutomationNodeData, type NodeType } from "@/lib/automations/types"
import { cn } from "@/lib/utils"

import { NODE_ICONS, nodeSummary } from "./node-meta"

export type FlowNode = Node<AutomationNodeData, NodeType>

export interface NodeRunState {
  status: string
  durationMs: number | null
}

interface CanvasContextValue {
  runState: Record<string, NodeRunState>
  issues: Record<string, number>
  running: boolean
}

const CanvasContext = createContext<CanvasContextValue>({ runState: {}, issues: {}, running: false })

const HANDLE_CLASS = "!size-2.5 !border-2 !border-background !bg-muted-foreground"

function StatusChip({ state, running }: { state?: NodeRunState; running: boolean }) {
  if (!state) return running ? <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" aria-label="Pending" /> : null
  const ms = state.durationMs !== null ? <span className="font-mono tabular-nums">{state.durationMs}ms</span> : null
  const base = "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
  switch (state.status) {
    case "SUCCEEDED":
      return (
        <span className={cn(base, "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
          <CheckIcon className="size-3" /> {ms}
        </span>
      )
    case "FAILED":
      return (
        <span className={cn(base, "bg-destructive/10 text-destructive")}>
          <XIcon className="size-3" /> {ms}
        </span>
      )
    case "WAITING":
      return (
        <span className={cn(base, "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
          <PauseIcon className="size-3" /> waiting
        </span>
      )
    default:
      return <span className={cn(base, "bg-muted text-muted-foreground")}>{state.status.toLowerCase()}</span>
  }
}

function StepNode({ id, type, data, selected }: NodeProps<FlowNode>) {
  const { runState, issues, running } = useContext(CanvasContext)
  const Icon = NODE_ICONS[type]
  const handles = BRANCH_HANDLES[type]
  const state = runState[id]
  const issueCount = issues[id] ?? 0
  return (
    <div
      className={cn(
        "w-60 rounded-md border bg-card text-card-foreground",
        selected && "border-foreground/60 ring-2 ring-ring/30",
        state?.status === "FAILED" && "border-destructive/60",
        state?.status === "WAITING" && "border-amber-500/60"
      )}
    >
      {type !== "trigger" && <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />}
      <div className="flex items-center gap-2 border-b px-2.5 py-1.5">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{type === "update_submission" ? "update" : type}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {issueCount > 0 && <AlertCircleIcon className="size-3.5 text-destructive" aria-label={`${issueCount} issue(s)`} />}
          <StatusChip state={state} running={running} />
        </span>
      </div>
      <div className="px-2.5 py-2">
        <div className="truncate text-sm font-medium">{data.label}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{nodeSummary({ id, type, data, position: { x: 0, y: 0 } })}</div>
        <div className="mt-1 font-mono text-[10px] text-muted-foreground/80">{id}</div>
      </div>
      {handles ? (
        <div className="flex justify-between border-t px-2.5 py-1 text-[10px] text-muted-foreground">
          {handles.map((h, i) => (
            <span key={h} className="relative">
              {h}
              <Handle
                id={h}
                type="source"
                position={Position.Bottom}
                className={cn(HANDLE_CLASS, i === 0 ? "!bg-emerald-600" : "!bg-destructive")}
                style={{ left: "50%", bottom: -9 }}
              />
            </span>
          ))}
        </div>
      ) : (
        <Handle type="source" position={Position.Bottom} className={HANDLE_CLASS} />
      )}
    </div>
  )
}

const nodeTypes = {
  trigger: StepNode,
  condition: StepNode,
  transform: StepNode,
  delay: StepNode,
  approval: StepNode,
  http: StepNode,
  email: StepNode,
  update_submission: StepNode,
  chat: StepNode,
  notify: StepNode,
}

export function styleEdge(e: Edge): Edge {
  const branch = e.sourceHandle
  const negative = branch === "false" || branch === "rejected"
  return {
    ...e,
    type: "smoothstep",
    label: branch ?? undefined,
    labelStyle: { fontSize: 10, fontFamily: "var(--font-mono)" },
    labelBgStyle: { fill: "var(--background)" },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { strokeWidth: 1.25, stroke: negative ? "var(--destructive)" : branch ? "var(--color-emerald-600)" : "var(--muted-foreground)" },
  }
}

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelect,
  runState,
  issues,
  running,
  onDropType,
}: {
  nodes: FlowNode[]
  edges: Edge[]
  onNodesChange: (changes: NodeChangeset<FlowNode>) => void
  onEdgesChange: (changes: EdgeChangeset<Edge>) => void
  onConnect: (c: Connection) => void
  onSelect: (id: string | null) => void
  runState: Record<string, NodeRunState>
  issues: Record<string, number>
  running: boolean
  onDropType: (type: NodeType, position: { x: number; y: number }) => void
}) {
  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      if (!c.source || !c.target) return false
      const target = nodes.find((n) => n.id === c.target)
      if (!target || target.type === "trigger") return false
      const graph: AutomationGraph = { nodes: [], edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) }
      return !wouldCreateCycle(graph, c.source, c.target)
    },
    [nodes, edges]
  )

  return (
    <CanvasContext.Provider value={{ runState, issues, running }}>
      <div
        className="h-full w-full"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-automation-node")) {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
          }
        }}
        onDrop={(e) => {
          const type = e.dataTransfer.getData("application/x-automation-node") as NodeType
          if (!type) return
          e.preventDefault()
          const el = (e.currentTarget.querySelector(".react-flow__viewport") as HTMLElement | null) ?? e.currentTarget
          const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
          const rect = e.currentTarget.getBoundingClientRect()
          const x = (e.clientX - rect.left - m.e) / (m.a || 1)
          const y = (e.clientY - rect.top - m.f) / (m.d || 1)
          onDropType(type, { x: x - 120, y: y - 30 })
        }}
      >
        <ReactFlow<FlowNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onSelectionChange={({ nodes: sel }) => onSelect(sel.length === 1 ? sel[0].id : null)}
          onPaneClick={() => onSelect(null)}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </div>
    </CanvasContext.Provider>
  )
}
