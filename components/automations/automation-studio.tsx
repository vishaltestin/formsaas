"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  addEdge,
  type Connection,
  type Edge,
  type EdgeChangeset,
  type NodeChangeset,
} from "@xyflow/react"
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  MoreHorizontalIcon,
  PlayIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
  WorkflowIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  decideAutomationApproval,
  deleteAutomation,
  duplicateAutomation,
  saveAutomation,
  testRunAutomation,
} from "@/app/actions/automations"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { nextNodeId, validateGraph } from "@/lib/automations/graph"
import {
  BRANCH_HANDLES,
  defaultNodeConfig,
  NODE_CATALOG,
  NODE_ID_PREFIX,
  TRIGGER_LABELS,
  type AutomationGraph,
  type AutomationNodeData,
  type NodeType,
  type TriggerKind,
} from "@/lib/automations/types"
import { availableVariables } from "@/lib/automations/variables"
import type { RunView } from "@/lib/automations/view"
import { cn } from "@/lib/utils"

import {
  FlowCanvas,
  styleEdge,
  type FlowNode,
  type NodeRunState,
} from "./flow-canvas"
import { NewAutomationDialog } from "./new-automation-dialog"
import { NODE_ICONS } from "./node-meta"
import {
  EmailTemplateChoicesContext,
  NodeInspector,
  type EmailTemplateChoices,
} from "./node-inspector"
import { RunHistory } from "./run-history"
import { JsonBlock, RunStatusBadge, RunSteps } from "./run-steps"

export interface AutomationSummary {
  id: string
  name: string
  description: string | null
  enabled: boolean
  trigger: string
  graph: AutomationGraph
  updatedAt: string
  runs: number
  failed: number
}

function toFlowNodes(graph: AutomationGraph): FlowNode[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
    deletable: n.type !== "trigger",
  }))
}

function toFlowEdges(graph: AutomationGraph): Edge[] {
  return graph.edges.map((e) =>
    styleEdge({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
    })
  )
}

function toGraph(nodes: FlowNode[], edges: Edge[]): AutomationGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as NodeType,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
    })),
  }
}

export function AutomationStudio({
  formId,
  formTitle,
  fields,
  webhooksAllowed,
  automations,
  selectedId,
  runs,
  initialRunId,
  emailTemplates = { options: [], allowed: false },
}: {
  formId: string
  formTitle: string
  fields: { key: string; label: string }[]
  webhooksAllowed: boolean
  automations: AutomationSummary[]
  selectedId: string | null
  runs: RunView[]
  initialRunId: string | null
  emailTemplates?: EmailTemplateChoices
}) {
  const router = useRouter()
  const current = automations.find((a) => a.id === selectedId) ?? null
  const [newOpen, setNewOpen] = useState(false)

  if (!current)
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WorkflowIcon />
            </EmptyMedia>
            <EmptyTitle>Automate what happens after a response</EmptyTitle>
            <EmptyDescription>
              Route submissions with conditions, wait for human approval, call
              APIs with signed requests, send emails and update submissions —
              all on a visual canvas.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setNewOpen(true)}>
              <PlusIcon data-icon="inline-start" /> New automation
            </Button>
          </EmptyContent>
        </Empty>
        <NewAutomationDialog
          formId={formId}
          open={newOpen}
          onOpenChange={setNewOpen}
          onCreated={(id) =>
            router.push(`/dashboard/forms/${formId}/automations?a=${id}`)
          }
        />
      </div>
    )

  return (
    <EmailTemplateChoicesContext.Provider value={emailTemplates}>
      <StudioEditor
        key={current.id}
        formId={formId}
        formTitle={formTitle}
        fields={fields}
        webhooksAllowed={webhooksAllowed}
        automations={automations}
        current={current}
        runs={runs}
        initialRunId={initialRunId}
      />
    </EmailTemplateChoicesContext.Provider>
  )
}

function StudioEditor({
  formId,
  formTitle,
  fields,
  webhooksAllowed,
  automations,
  current,
  runs,
  initialRunId,
}: {
  formId: string
  formTitle: string
  fields: { key: string; label: string }[]
  webhooksAllowed: boolean
  automations: AutomationSummary[]
  current: AutomationSummary
  runs: RunView[]
  initialRunId: string | null
}) {
  const router = useRouter()
  const [nodes, setNodes] = useState<FlowNode[]>(() =>
    toFlowNodes(current.graph)
  )
  const [edges, setEdges] = useState<Edge[]>(() => toFlowEdges(current.graph))
  const [name, setName] = useState(current.name)
  const [enabled, setEnabled] = useState(current.enabled)
  const [dirty, setDirty] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [testRun, setTestRun] = useState<RunView | null>(null)
  const [tab, setTab] = useState(initialRunId ? "runs" : "canvas")
  const [newOpen, setNewOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saving, startSave] = useTransition()
  const [running, startRun] = useTransition()
  const [deciding, startDecide] = useTransition()

  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges])
  const issues = useMemo(() => validateGraph(graph), [graph])
  const errorCount = issues.filter((i) => i.severity === "error").length
  const issueMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const i of issues)
      if (i.nodeId && i.severity === "error")
        m[i.nodeId] = (m[i.nodeId] ?? 0) + 1
    return m
  }, [issues])
  const runState = useMemo(() => {
    const m: Record<string, NodeRunState> = {}
    for (const s of testRun?.steps ?? [])
      m[s.nodeId] = { status: s.status, durationMs: s.durationMs }
    return m
  }, [testRun])
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null
  const groups = useMemo(
    () => availableVariables(graph, selectedNodeId, fields),
    [graph, selectedNodeId, fields]
  )
  const hasTrigger = nodes.some((n) => n.type === "trigger")

  const onNodesChange = useCallback((changes: NodeChangeset<FlowNode>) => {
    for (const c of changes.getByType("remove"))
      if (c.id.startsWith("trigger")) changes.remove(c)
    if (
      changes
        .toArray()
        .some(
          (c) =>
            c.type === "position" || c.type === "remove" || c.type === "add"
        )
    )
      setDirty(true)
    setNodes((ns) => changes.applyTo(ns))
  }, [])
  const onEdgesChange = useCallback((changes: EdgeChangeset<Edge>) => {
    if (changes.toArray().some((c) => c.type === "remove" || c.type === "add"))
      setDirty(true)
    setEdges((es) => changes.applyTo(es))
  }, [])
  const onConnect = useCallback((c: Connection) => {
    setDirty(true)
    setEdges((es) =>
      addEdge(
        styleEdge({
          ...c,
          id: `e_${c.source}_${c.sourceHandle ?? "out"}_${c.target}`,
        } as Edge),
        es
      )
    )
  }, [])

  const addNode = (type: NodeType, position?: { x: number; y: number }) => {
    const id = nextNodeId(graph, NODE_ID_PREFIX[type])
    const anchor = (selectedNode ?? nodes[nodes.length - 1]) as
      FlowNode | undefined
    const pos =
      position ??
      (anchor
        ? { x: anchor.position.x, y: anchor.position.y + 150 }
        : { x: 0, y: 0 })
    const label = NODE_CATALOG.find((c) => c.type === type)?.label ?? type
    const node: FlowNode = {
      id,
      type,
      position: pos,
      data: { label, config: defaultNodeConfig(type) as never },
      deletable: type !== "trigger",
    }
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      { ...node, selected: true },
    ])
    if (!position && anchor && type !== "trigger") {
      const handles = BRANCH_HANDLES[anchor.type as NodeType]
      const sourceHandle = handles ? handles[0] : null
      setEdges((es) =>
        addEdge(
          styleEdge({
            id: `e_${anchor.id}_${sourceHandle ?? "out"}_${id}`,
            source: anchor.id,
            target: id,
            sourceHandle,
          }),
          es
        )
      )
    }
    setSelectedNodeId(id)
    setDirty(true)
  }

  const updateNodeData = (id: string, data: AutomationNodeData) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data } : n)))
    setDirty(true)
  }

  const save = (opts?: { enabled?: boolean }) =>
    startSave(async () => {
      const nextEnabled = opts?.enabled ?? enabled
      const res = await saveAutomation(current.id, {
        name,
        description: current.description,
        enabled: nextEnabled,
        graph,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setEnabled(res.data.enabled)
      setDirty(false)
      toast.success(
        opts?.enabled === undefined
          ? "Automation saved"
          : nextEnabled
            ? "Automation enabled"
            : "Automation paused"
      )
      router.refresh()
    })

  const runTest = () =>
    startRun(async () => {
      setTestRun(null)
      const res = await testRunAutomation(current.id, graph)
      if (!res.ok) return void toast.error(res.error)
      if (!res.data.run) {
        toast.error("Fix the highlighted issues before running a test.")
        return
      }
      setTestRun(res.data.run)
      setSelectedNodeId(null)
      const s = res.data.run.status
      if (s === "SUCCEEDED")
        toast.success(`Test run succeeded in ${res.data.run.durationMs ?? 0}ms`)
      else if (s === "FAILED")
        toast.error("Test run failed — see the highlighted step")
      else toast.message("Test run is waiting for approval")
      router.refresh()
    })

  const decideTest = (decision: "approved" | "rejected") =>
    testRun &&
    startDecide(async () => {
      const res = await decideAutomationApproval(
        testRun.id,
        decision,
        "Test run (canvas)"
      )
      if (!res.ok) return void toast.error(res.error)
      setTestRun(res.data)
      router.refresh()
    })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (!saving) save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const focusStep =
    testRun && selectedNodeId
      ? testRun.steps.find((s) => s.nodeId === selectedNodeId)
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="max-w-56 justify-between gap-1.5"
            >
              <WorkflowIcon data-icon="inline-start" />
              <span className="truncate">{current.name}</span>
              <ChevronsUpDownIcon
                data-icon="inline-end"
                className="text-muted-foreground"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Automations · {formTitle}
            </DropdownMenuLabel>
            {automations.map((a) => (
              <DropdownMenuItem key={a.id} asChild>
                <Link
                  href={`/dashboard/forms/${formId}/automations?a=${a.id}`}
                  className="flex items-center gap-2"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      a.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
                    )}
                  />
                  <span className="truncate">{a.name}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground tabular-nums">
                    {a.runs} runs
                  </span>
                  {a.id === current.id && <CheckIcon className="size-3.5" />}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setNewOpen(true)}>
              <PlusIcon /> New automation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          aria-label="Automation name"
          className="h-8 max-w-64 border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-input"
          value={name}
          maxLength={80}
          onChange={(e) => (setName(e.target.value), setDirty(true))}
        />
        {dirty && (
          <span className="text-xs text-muted-foreground">Unsaved</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={enabled}
                  disabled={saving}
                  onCheckedChange={(v) => save({ enabled: v })}
                  aria-label="Enable automation"
                />
                <span className="hidden sm:inline">
                  {enabled ? "Enabled" : "Paused"}
                </span>
              </label>
            </TooltipTrigger>
            <TooltipContent>
              {enabled
                ? `Runs on: ${TRIGGER_LABELS[(current.trigger as TriggerKind) ?? "FORM_SUBMITTED"]}`
                : "Enable to run on live triggers"}
            </TooltipContent>
          </Tooltip>
          <Button
            variant="outline"
            size="sm"
            onClick={runTest}
            disabled={running || errorCount > 0}
          >
            {running ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}{" "}
            Test run
          </Button>
          <Button size="sm" onClick={() => save()} disabled={saving || !dirty}>
            {saving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}{" "}
            Save
            <Kbd className="ml-1 hidden md:inline-flex">⌘S</Kbd>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={async () => {
                  const res = await duplicateAutomation(current.id)
                  if (!res.ok) return void toast.error(res.error)
                  toast.success("Automation duplicated")
                  router.push(
                    `/dashboard/forms/${formId}/automations?a=${res.data.id}`
                  )
                }}
              >
                <CopyIcon /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="flex h-11 shrink-0 items-center gap-4 border-b px-4">
          <TabsList variant="line" className="h-11!">
            <TabsTrigger value="canvas">Canvas</TabsTrigger>
            <TabsTrigger value="runs">
              Run history{" "}
              <span className="ml-1 font-mono text-[10px] text-muted-foreground tabular-nums">
                {runs.length}
              </span>
            </TabsTrigger>
          </TabsList>
          {errorCount > 0 ? (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircleIcon className="size-3.5" /> {errorCount} issue
              {errorCount === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckIcon className="size-3.5" /> Valid DAG
            </span>
          )}
        </div>

        <TabsContent value="canvas" className="min-h-0 flex-1">
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel defaultSize="17%" minSize="12%" maxSize="28%">
              <ScrollArea className="h-full">
                <div className="space-y-4 p-3">
                  {(["Trigger", "Logic", "Action"] as const).map((group) => (
                    <div key={group}>
                      <p className="mb-1.5 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        {group}
                      </p>
                      <div className="space-y-0.5">
                        {NODE_CATALOG.filter((c) => c.group === group).map(
                          (c) => {
                            const Icon = NODE_ICONS[c.type]
                            const disabled = c.type === "trigger" && hasTrigger
                            const gated =
                              (c.type === "http" || c.type === "chat") &&
                              !webhooksAllowed
                            return (
                              <button
                                key={c.type}
                                type="button"
                                disabled={disabled}
                                draggable={!disabled}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData(
                                    "application/x-automation-node",
                                    c.type
                                  )
                                  e.dataTransfer.effectAllowed = "move"
                                }}
                                onClick={() => addNode(c.type)}
                                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0">
                                  <span className="flex items-center gap-1.5 text-sm">
                                    {c.label}
                                    {gated && (
                                      <Badge
                                        variant="outline"
                                        className="h-4 px-1 text-[9px]"
                                      >
                                        Pro
                                      </Badge>
                                    )}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {c.description}
                                  </span>
                                </span>
                              </button>
                            )
                          }
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="px-1 text-xs text-muted-foreground">
                    Click to add after the selected step, or drag onto the
                    canvas.
                  </p>
                </div>
              </ScrollArea>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="53%" minSize="30%">
              <FlowCanvas
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onSelect={setSelectedNodeId}
                runState={runState}
                issues={issueMap}
                running={running}
                onDropType={(type, position) => addNode(type, position)}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="30%" minSize="22%" maxSize="45%">
              <ScrollArea className="h-full">
                <div className="space-y-5 p-4">
                  {selectedNode ? (
                    <>
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold">
                          Configure step
                        </h2>
                        {selectedNode.type !== "trigger" && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setNodes((ns) =>
                                ns.filter((n) => n.id !== selectedNode.id)
                              )
                              setEdges((es) =>
                                es.filter(
                                  (e) =>
                                    e.source !== selectedNode.id &&
                                    e.target !== selectedNode.id
                                )
                              )
                              setSelectedNodeId(null)
                              setDirty(true)
                            }}
                          >
                            <Trash2Icon data-icon="inline-start" /> Remove
                          </Button>
                        )}
                      </div>
                      {issues
                        .filter((i) => i.nodeId === selectedNode.id)
                        .map((i, idx) => (
                          <p
                            key={idx}
                            className={cn(
                              "flex items-start gap-1.5 text-xs",
                              i.severity === "error"
                                ? "text-destructive"
                                : "text-amber-700 dark:text-amber-400"
                            )}
                          >
                            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />{" "}
                            {i.message}
                          </p>
                        ))}
                      <NodeInspector
                        key={selectedNode.id}
                        nodeId={selectedNode.id}
                        type={selectedNode.type as NodeType}
                        data={selectedNode.data}
                        groups={groups}
                        onChange={(data) =>
                          updateNodeData(selectedNode.id, data)
                        }
                      />
                      {focusStep && (
                        <div className="space-y-2 border-t pt-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">
                              Last test run
                            </h3>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                {focusStep.durationMs ?? 0}ms
                              </span>
                              <RunStatusBadge status={focusStep.status} />
                            </span>
                          </div>
                          {focusStep.error && (
                            <p className="font-mono text-xs text-destructive">
                              {focusStep.error}
                            </p>
                          )}
                          <p className="text-[11px] font-medium text-muted-foreground uppercase">
                            Input
                          </p>
                          <JsonBlock value={focusStep.input} />
                          <p className="text-[11px] font-medium text-muted-foreground uppercase">
                            Output
                          </p>
                          <JsonBlock value={focusStep.output} />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div>
                        <h2 className="text-sm font-semibold">
                          {testRun ? "Test run" : "Overview"}
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {testRun
                            ? "Select a step on the canvas to inspect its input and output."
                            : "Select a step to configure it. Test runs use the latest submission (or sample data) and never modify submissions."}
                        </p>
                      </div>
                      {testRun && testRun.status === "WAITING_APPROVAL" && (
                        <div className="space-y-2 rounded-md border border-amber-500/40 p-3">
                          <p className="text-sm font-medium">
                            Waiting for approval
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Decide here to continue the test run down the
                            approved or rejected path.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={deciding}
                              onClick={() => decideTest("approved")}
                            >
                              <CheckIcon data-icon="inline-start" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={deciding}
                              onClick={() => decideTest("rejected")}
                            >
                              <XIcon data-icon="inline-start" /> Reject
                            </Button>
                          </div>
                        </div>
                      )}
                      {testRun && <RunSteps run={testRun} />}
                      {issues.length > 0 && (
                        <div className="space-y-1.5">
                          <h3 className="text-xs font-medium text-muted-foreground uppercase">
                            Validation
                          </h3>
                          {issues.map((i, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className={cn(
                                "flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted",
                                i.severity === "error"
                                  ? "text-destructive"
                                  : "text-amber-700 dark:text-amber-400"
                              )}
                              onClick={() =>
                                i.nodeId && setSelectedNodeId(i.nodeId)
                              }
                            >
                              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                              <span>
                                {i.nodeId && (
                                  <code className="mr-1 font-mono">
                                    {i.nodeId}
                                  </code>
                                )}
                                {i.message}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
                        <p>
                          <span className="font-mono tabular-nums">
                            {nodes.length}
                          </span>{" "}
                          steps ·{" "}
                          <span className="font-mono tabular-nums">
                            {edges.length}
                          </span>{" "}
                          connections ·{" "}
                          <span className="font-mono tabular-nums">
                            {current.runs}
                          </span>{" "}
                          runs
                          {current.failed > 0 && (
                            <>
                              {" "}
                              ·{" "}
                              <span className="font-mono text-destructive tabular-nums">
                                {current.failed}
                              </span>{" "}
                              failed
                            </>
                          )}
                        </p>
                        <p>
                          Reference data with{" "}
                          <code className="font-mono">
                            {"{{trigger.data.<key>}}"}
                          </code>{" "}
                          and step outputs with{" "}
                          <code className="font-mono">
                            {"{{nodes.<id>.<path>}}"}
                          </code>
                          .
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        </TabsContent>

        <TabsContent value="runs" className="min-h-0 flex-1 overflow-auto p-4">
          <RunHistory runs={runs} formId={formId} initialRunId={initialRunId} />
        </TabsContent>
      </Tabs>

      <NewAutomationDialog
        formId={formId}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) =>
          router.push(`/dashboard/forms/${formId}/automations?a=${id}`)
        }
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{current.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The automation and its entire run history will be permanently
              deleted. Waiting runs are cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const res = await deleteAutomation(current.id)
                if (!res.ok) return void toast.error(res.error)
                toast.success("Automation deleted")
                router.push(`/dashboard/forms/${formId}/automations`)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
