"use client"

import "@xyflow/react/dist/style.css"

import { useEffect, useMemo } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import { FlagIcon, GitBranchIcon, LayersIcon } from "lucide-react"

import {
  END_STEP_ID,
  FIELD_DEFINITIONS,
  isInputField,
  ruleStepIndex,
  START_STEP_ID,
  stepIndexOfField,
  type FormSchema,
  type LogicRule,
  type Step,
} from "@/lib/form-engine"
import { cn } from "@/lib/utils"

import { ACTION_LABELS, OPERATOR_LABELS } from "./rule-card"

type StepData = { index: number; title: string; fields: string[]; more: number; mode: string }
type RuleData = { name: string; when: string; then: string[]; enabled: boolean; selected: boolean; index: number }
type StepNodeT = Node<StepData, "step">
type RuleNodeT = Node<RuleData, "rule">
type EndNodeT = Node<Record<string, never>, "end">
type FlowNode = StepNodeT | RuleNodeT | EndNodeT

const COL = 340

function StepNode({ data, selected }: NodeProps<StepNodeT>) {
  return (
    <div className={cn("w-60 rounded-lg border bg-card text-card-foreground shadow-xs", selected && "ring-2 ring-ring/50")}>
      <Handle type="target" position={Position.Left} className="!size-2.5 !border-2 !border-background !bg-muted-foreground" />
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <LayersIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground uppercase">{data.mode === "CLASSIC" ? "Section" : `Step ${data.index + 1}`}</span>
      </div>
      <div className="px-3 py-2">
        <div className="truncate text-sm font-medium">{data.title}</div>
        <ul className="mt-1.5 space-y-0.5">
          {data.fields.map((f, i) => (
            <li key={i} className="truncate text-xs text-muted-foreground">
              · {f}
            </li>
          ))}
          {data.more > 0 && <li className="text-xs text-muted-foreground">+{data.more} more</li>}
          {data.fields.length === 0 && <li className="text-xs text-muted-foreground italic">No questions</li>}
        </ul>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2.5 !border-2 !border-background !bg-foreground" />
    </div>
  )
}

function RuleNode({ data }: NodeProps<RuleNodeT>) {
  return (
    <div
      className={cn(
        "w-64 rounded-lg border border-dashed bg-background text-foreground",
        data.selected && "border-solid ring-2 ring-ring/60",
        !data.enabled && "opacity-50"
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-2.5 !border-2 !border-background !bg-muted-foreground" />
      <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] font-medium text-muted-foreground uppercase">
        <GitBranchIcon className="size-3" /> Rule {data.index + 1}
        {!data.enabled && <span className="ml-auto normal-case">off</span>}
      </div>
      <div className="px-3 pb-2.5">
        <div className="truncate text-sm font-medium">{data.name}</div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">If</span> {data.when || "no conditions"}
        </p>
        {data.then.map((t, i) => (
          <p key={i} className="truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground">→</span> {t}
          </p>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!size-2.5 !border-2 !border-background !bg-foreground" />
    </div>
  )
}

function EndNode() {
  return (
    <div className="flex items-center gap-2 rounded-full border bg-foreground px-4 py-2 text-sm font-medium text-background">
      <Handle type="target" position={Position.Left} className="!size-2.5 !border-2 !border-background !bg-muted-foreground" />
      <FlagIcon className="size-3.5" /> Submit & thank you
    </div>
  )
}

const nodeTypes = { step: StepNode, rule: RuleNode, end: EndNode }

function describeRule(rule: LogicRule, schema: FormSchema, steps: Step[]) {
  const label = (id?: string) => {
    const f = schema.fields.find((x) => x.id === id)
    return f ? f.label || FIELD_DEFINITIONS[f.type].label : "?"
  }
  const when = rule.conditions
    .map((c) => {
      const f = schema.fields.find((x) => x.id === c.fieldId)
      const opt = f?.options?.find((o) => o.value === c.value)
      const v = c.operator === "is_empty" || c.operator === "is_not_empty" ? "" : ` “${opt?.label ?? c.value ?? ""}”`
      return `${label(c.fieldId)} ${OPERATOR_LABELS[c.operator]}${v}`
    })
    .join(rule.combinator === "AND" ? " and " : " or ")
  const then = rule.actions.map((a) => {
    switch (a.type) {
      case "JUMP_TO_STEP": {
        if (a.targetStepId === END_STEP_ID) return "Jump to end"
        const s = steps.find((x) => x.id === a.targetStepId)
        return `Jump to ${s ? s.title || `step ${s.index + 1}` : "?"}`
      }
      case "REDIRECT_OR_CUSTOM_THANK_YOU":
        return a.redirectUrl ? `Redirect to ${a.redirectUrl}` : `Ending: ${a.thankYouTitle || "custom message"}`
      case "SET_VALUE":
        return `Set ${label(a.targetFieldId)} = ${a.value ?? ""}`
      default:
        return `${ACTION_LABELS[a.type].replace(" field", "")} ${label(a.targetFieldId)}`
    }
  })
  return { when, then }
}

export function buildGraph(
  schema: FormSchema,
  steps: Step[],
  mode: string,
  layout: Record<string, { x: number; y: number }>,
  selectedRuleId: string | null
): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = []
  const edges: Edge[] = []
  const muted = "var(--muted-foreground)"

  steps.forEach((s, i) => {
    const inputs = s.fields.filter((f) => isInputField(f) && f.type !== "hidden")
    nodes.push({
      id: s.id,
      type: "step",
      position: layout[s.id] ?? { x: i * COL, y: 0 },
      data: {
        index: i,
        title: s.title || (i === 0 ? "Start" : `Step ${i + 1}`),
        fields: inputs.slice(0, 5).map((f) => f.label || FIELD_DEFINITIONS[f.type].label),
        more: Math.max(0, inputs.length - 5),
        mode,
      },
      deletable: false,
    })
    const next = steps[i + 1]?.id ?? END_STEP_ID
    edges.push({
      id: `seq:${s.id}`,
      source: s.id,
      target: next,
      type: "smoothstep",
      style: { stroke: muted, strokeDasharray: "4 4", opacity: 0.6 },
      markerEnd: { type: MarkerType.ArrowClosed, color: muted },
      deletable: false,
      selectable: false,
    })
  })
  nodes.push({
    id: END_STEP_ID,
    type: "end",
    position: layout[END_STEP_ID] ?? { x: steps.length * COL, y: 40 },
    data: {},
    deletable: false,
  })

  const perStep: Record<number, number> = {}
  schema.logic.forEach((rule, ri) => {
    const owner = ruleStepIndex(steps, rule)
    const col = owner < 0 ? 0 : owner
    perStep[col] = (perStep[col] ?? 0) + 1
    const nodeId = `rule:${rule.id}`
    const { when, then } = describeRule(rule, schema, steps)
    const selected = rule.id === selectedRuleId
    nodes.push({
      id: nodeId,
      type: "rule",
      position: layout[nodeId] ?? { x: col * COL + COL / 2 - 20, y: 200 + (perStep[col] - 1) * 150 },
      data: { name: rule.name, when, then, enabled: rule.enabled, selected, index: ri },
      selected,
    })
    const color = rule.enabled ? "var(--foreground)" : muted
    if (owner >= 0) {
      edges.push({
        id: `in:${rule.id}`,
        source: steps[owner].id,
        target: nodeId,
        type: "smoothstep",
        style: { stroke: color, opacity: 0.5 },
        deletable: false,
      })
    }
    rule.actions.forEach((a) => {
      let target: string | null = null
      if (a.type === "JUMP_TO_STEP") target = a.targetStepId === START_STEP_ID ? steps[0]?.id : (a.targetStepId ?? null)
      else if (a.type === "REDIRECT_OR_CUSTOM_THANK_YOU") target = END_STEP_ID
      else if (a.targetFieldId) {
        const si = stepIndexOfField(steps, a.targetFieldId)
        target = si >= 0 ? steps[si].id : null
      }
      if (!target) return
      const jump = a.type === "JUMP_TO_STEP"
      edges.push({
        id: `out:${rule.id}:${a.id}`,
        source: nodeId,
        target,
        type: "smoothstep",
        animated: jump && rule.enabled,
        label: jump ? "jump" : a.type === "REDIRECT_OR_CUSTOM_THANK_YOU" ? "ending" : ACTION_LABELS[a.type].split(" ")[0].toLowerCase(),
        labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
        labelBgStyle: { fill: "var(--background)" },
        style: { stroke: color, strokeWidth: jump ? 1.75 : 1.25 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        deletable: false,
      })
    })
  })

  return { nodes, edges }
}

function GraphInner({
  schema,
  steps,
  mode,
  layout,
  selectedRuleId,
  disabled,
  onSelectRule,
  onLayout,
  onConnect,
  onDeleteRule,
}: LogicGraphProps) {
  const built = useMemo(() => buildGraph(schema, steps, mode, layout, selectedRuleId), [schema, steps, mode, layout, selectedRuleId])
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(built.nodes)
  useEffect(() => setNodes(built.nodes), [built.nodes, setNodes])

  return (
    <ReactFlow<FlowNode, Edge>
      nodes={nodes}
      edges={built.edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, node, dragged) => {
        const next = { ...layout }
        for (const n of dragged.length ? dragged : [node]) next[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
        onLayout(next)
      }}
      onNodeClick={(_, node) => {
        if (node.type === "rule") onSelectRule(node.id.slice(5))
      }}
      onPaneClick={() => onSelectRule(null)}
      onConnect={(c: Connection) => !disabled && onConnect(c)}
      onNodesDelete={(deleted) => deleted.forEach((n) => n.type === "rule" && onDeleteRule(n.id.slice(5)))}
      nodesConnectable={!disabled}
      deleteKeyCode={disabled ? null : ["Delete", "Backspace"]}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.25}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="!hidden md:!block" />
      <Panel position="top-left" className="rounded-md border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground">
        Drag from a step’s right handle to another step to create a jump rule. Select a rule and press Delete to remove it.
      </Panel>
    </ReactFlow>
  )
}

export interface LogicGraphProps {
  schema: FormSchema
  steps: Step[]
  mode: string
  layout: Record<string, { x: number; y: number }>
  selectedRuleId: string | null
  disabled: boolean
  onSelectRule: (id: string | null) => void
  onLayout: (layout: Record<string, { x: number; y: number }>) => void
  onConnect: (c: Connection) => void
  onDeleteRule: (id: string) => void
}

export function LogicGraph(props: LogicGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  )
}
