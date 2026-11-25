"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { CloudCheckIcon, LoaderIcon, LockIcon, PlusIcon, WandSparklesIcon, WaypointsIcon } from "lucide-react"
import { toast } from "sonner"
import type { Connection } from "@xyflow/react"

import { saveLogic } from "@/app/actions/forms"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  END_STEP_ID,
  getSteps,
  isInputField,
  uid,
  type FormMode,
  type FormSchema,
  type LogicRule,
} from "@/lib/form-engine"

import { LogicGraph } from "./logic-graph"
import { newAction, newCondition, RuleCard } from "./rule-card"

type Layout = Record<string, { x: number; y: number }>

export function LogicEditor({
  formId,
  mode,
  schema: initialSchema,
  enabled,
}: {
  formId: string
  mode: FormMode
  schema: FormSchema
  enabled: boolean
}) {
  const [rules, setRules] = useState<LogicRule[]>(initialSchema.logic)
  const [layout, setLayout] = useState<Layout>(initialSchema.logicLayout ?? {})
  const [selectedId, setSelectedId] = useState<string | null>(initialSchema.logic[0]?.id ?? null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved")
  const [revision, setRevision] = useState(0)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const schema = useMemo(() => ({ ...initialSchema, logic: rules, logicLayout: layout }), [initialSchema, rules, layout])
  const steps = useMemo(() => getSteps(schema), [schema])
  const fields = schema.fields
  const locked = !enabled

  /* autosave */
  const latest = useRef({ rules, layout })
  useLayoutEffect(() => {
    latest.current = { rules, layout }
  }, [rules, layout])
  const save = useCallback(async () => {
    setSaveState("saving")
    const res = await saveLogic(formId, latest.current.rules, latest.current.layout)
    if (!res.ok) {
      setSaveState("error")
      toast.error(res.error)
      return
    }
    setSaveState("saved")
  }, [formId])
  useEffect(() => {
    if (revision === 0) return
    const t = setTimeout(() => void save(), 900)
    return () => clearTimeout(t)
  }, [revision, save])

  const commitRules = (next: LogicRule[]) => {
    setRules(next)
    setSaveState("dirty")
    setRevision((r) => r + 1)
  }

  const addRule = (partial?: Partial<LogicRule>) => {
    const rule: LogicRule = {
      id: uid("rule"),
      name: `Rule ${rules.length + 1}`,
      enabled: true,
      combinator: "AND",
      conditions: [newCondition(fields)],
      actions: [newAction(mode !== "CLASSIC" && steps.length > 1 ? "JUMP_TO_STEP" : "SHOW_FIELD")],
      ...partial,
    }
    commitRules([...rules, rule])
    setSelectedId(rule.id)
    requestAnimationFrame(() => cardRefs.current[rule.id]?.scrollIntoView({ behavior: "smooth", block: "nearest" }))
  }

  const deleteRule = (id: string) => {
    commitRules(rules.filter((r) => r.id !== id))
    const nextLayout = { ...layout }
    delete nextLayout[`rule:${id}`]
    setLayout(nextLayout)
    if (selectedId === id) setSelectedId(null)
  }

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return
    const stepTitle = (id: string) => {
      if (id === END_STEP_ID) return "the end"
      const s = steps.find((x) => x.id === id)
      return s ? s.title || `step ${s.index + 1}` : "step"
    }
    if (c.source.startsWith("rule:")) {
      const ruleId = c.source.slice(5)
      if (c.target.startsWith("rule:")) return
      commitRules(
        rules.map((r) =>
          r.id === ruleId ? { ...r, actions: [...r.actions, { ...newAction("JUMP_TO_STEP"), targetStepId: c.target! }] } : r
        )
      )
      setSelectedId(ruleId)
      return
    }
    const source = steps.find((s) => s.id === c.source)
    if (!source) return
    const firstInput = source.fields.find(isInputField)
    if (!firstInput) return void toast.error("That step has no questions to branch on yet.")
    if (c.target.startsWith("rule:")) {
      const ruleId = c.target.slice(5)
      commitRules(
        rules.map((r) =>
          r.id === ruleId
            ? { ...r, conditions: [...r.conditions, { id: uid("c"), fieldId: firstInput.id, operator: "is_not_empty" as const, value: "" }] }
            : r
        )
      )
      setSelectedId(ruleId)
      return
    }
    const targetIdx = c.target === END_STEP_ID ? Infinity : steps.findIndex((s) => s.id === c.target)
    if (targetIdx <= source.index) return void toast.error("Jumps can only move forward to a later step.")
    addRule({
      name: `Jump from ${stepTitle(source.id)} to ${stepTitle(c.target)}`,
      conditions: [{ id: uid("c"), fieldId: firstInput.id, operator: "equals", value: "" }],
      actions: [{ ...newAction("JUMP_TO_STEP"), targetStepId: c.target }],
    })
    toast.success("Jump rule created — set its condition on the left.")
  }

  const enabledCount = rules.filter((r) => r.enabled).length

  return (
    <div className="flex h-[calc(100svh-5.75rem)] min-h-[520px] flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <WaypointsIcon className="size-4 text-muted-foreground" />
        <div className="min-w-0">
          <div className="text-sm font-medium">Conditional logic</div>
        </div>
        <Badge variant="secondary" className="tabular-nums">
          {enabledCount} active · {rules.length} total
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex" aria-live="polite">
            {saveState === "saving" ? (
              <>
                <LoaderIcon className="size-3.5 animate-spin" /> Saving…
              </>
            ) : saveState === "dirty" ? (
              <>
                <span className="size-1.5 rounded-full bg-amber-500" /> Unsaved
              </>
            ) : saveState === "error" ? (
              <button type="button" className="text-destructive" onClick={() => void save()}>
                Save failed · retry
              </button>
            ) : (
              <>
                <CloudCheckIcon className="size-3.5" /> Saved to draft
              </>
            )}
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/forms/${formId}/edit`}>Preview in builder</Link>
          </Button>
          <Button size="sm" onClick={() => addRule()} disabled={locked || !fields.some(isInputField)}>
            <PlusIcon /> Add rule
          </Button>
        </div>
      </div>

      {locked && (
        <div className="border-b p-3">
          <Alert>
            <LockIcon />
            <AlertTitle>Conditional logic is a Pro feature</AlertTitle>
            <AlertDescription>Existing rules are shown read-only and won’t run on your live form until you upgrade.</AlertDescription>
            <AlertAction>
              <Button size="sm" asChild>
                <Link href="/dashboard/billing">Upgrade</Link>
              </Button>
            </AlertAction>
          </Alert>
        </div>
      )}

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="40" minSize="28" maxSize="60" className="min-w-0">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-4">
              {rules.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <WandSparklesIcon />
                    </EmptyMedia>
                    <EmptyTitle>No rules yet</EmptyTitle>
                    <EmptyDescription>
                      Show or hide questions, require answers, skip steps, calculate values or send people to different endings.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button size="sm" onClick={() => addRule()} disabled={locked || !fields.some(isInputField)}>
                      <PlusIcon /> Create your first rule
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : (
                rules.map((rule, i) => (
                  <RuleCard
                    key={rule.id}
                    ref={(el) => {
                      cardRefs.current[rule.id] = el
                    }}
                    rule={rule}
                    index={i}
                    fields={fields}
                    steps={steps}
                    mode={mode}
                    selected={selectedId === rule.id}
                    disabled={locked}
                    onSelect={() => setSelectedId(rule.id)}
                    onChange={(next) => commitRules(rules.map((r) => (r.id === rule.id ? next : r)))}
                    onDelete={() => setConfirmDelete(rule.id)}
                  />
                ))
              )}
              {rules.length > 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  Rules are evaluated top to bottom; the first matching jump or ending wins. Changes save to your draft — publish from the builder to go live.
                </p>
              )}
            </div>
          </ScrollArea>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="60" minSize="30" className="min-w-0">
          <LogicGraph
            schema={schema}
            steps={steps}
            mode={mode}
            layout={layout}
            selectedRuleId={selectedId}
            disabled={locked}
            onSelectRule={(id) => {
              setSelectedId(id)
              if (id) cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" })
            }}
            onLayout={(next) => {
              setLayout(next)
              setSaveState("dirty")
              setRevision((r) => r + 1)
            }}
            onConnect={onConnect}
            onDeleteRule={(id) => setConfirmDelete(id)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              “{rules.find((r) => r.id === confirmDelete)?.name}” will stop running on the next publish.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDelete) deleteRule(confirmDelete)
                setConfirmDelete(null)
              }}
            >
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
