"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import {
  ChevronDownIcon,
  CircleAlertIcon,
  CloudCheckIcon,
  EyeIcon,
  LoaderIcon,
  MonitorIcon,
  Redo2Icon,
  RocketIcon,
  Share2Icon,
  SmartphoneIcon,
  TabletIcon,
  Undo2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { publishForm, saveDraft, setFormStatus, updateFormMeta } from "@/app/actions/forms"
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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { createField, FORM_MODES, getSteps, isInputField, type FieldType, type FormField, type FormMode } from "@/lib/form-engine"
import type { PlanFeatures } from "@/lib/plans"
import { getTemplate, TEMPLATES } from "@/lib/templates"
import { cn } from "@/lib/utils"

import { BuilderCanvas, CANVAS_DROP_ID } from "./builder-canvas"
import { DEVICE_SCREEN, type Viewport } from "./device-frame"
import { FieldInspector } from "./field-inspector"
import { LeftPanel, PaletteGhost } from "./left-panel"
import {
  deleteStep,
  duplicateField,
  duplicateStep,
  endOfStepIndex,
  moveField,
  moveFieldBy,
  moveStep,
  patchField,
  removeAllStepBreaks,
  removeField,
  stepFieldIds,
  takenKeys,
} from "./ops"
import { PreviewDialog } from "./preview-dialog"
import { SettingsInspector } from "./settings-inspector"
import { ThemeInspector } from "./theme-inspector"
import { useBuilderState, type BuilderDoc } from "./use-builder-state"
import { ValidationInspector } from "./validation-inspector"
import { VersionsSheet } from "./versions-sheet"

const MODE_LABELS: Record<FormMode, string> = {
  CLASSIC: "Classic",
  STEPPER: "Stepper",
  CARD: "Card (one at a time)",
  QUIZ: "Quiz",
}

type SaveState = "saved" | "dirty" | "saving" | "error"

export interface FormBuilderProps {
  formId: string
  slug: string
  status: "DRAFT" | "PUBLISHED" | "CLOSED"
  initial: BuilderDoc
  description: string
  hasUnpublishedChanges: boolean
  features: PlanFeatures
  maxUploadMb: number
  /** Workspace HTML email templates (custom emails need a Pro+ workspace) */
  emailTemplates?: { options: { id: string; name: string }[]; allowed: boolean; canManage: boolean }
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null
  if (!t) return false
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable
}

export function FormBuilder(props: FormBuilderProps) {
  const { formId, slug, features, maxUploadMb, emailTemplates } = props
  const router = useRouter()
  const builder = useBuilderState(props.initial)
  const { doc, update, undo, redo, reset, revision } = builder

  const [description, setDescription] = useState(props.description)
  const [status, setStatus] = useState(props.status)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState("field")
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const [activeStep, setActiveStep] = useState("all")
  const [previewOpen, setPreviewOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [unpublished, setUnpublished] = useState(props.hasUnpublishedChanges)
  const [publishCount, setPublishCount] = useState(0)
  const [dragType, setDragType] = useState<FieldType | null>(null)
  const [publishing, startPublish] = useTransition()

  /* ───────── autosave ───────── */
  const docRef = useRef(doc)
  const descRef = useRef(description)
  const savedDesc = useRef(props.description)
  const savingRef = useRef<Promise<boolean> | null>(null)
  const pendingRef = useRef(false)
  useLayoutEffect(() => {
    docRef.current = doc
    descRef.current = description
  }, [doc, description])

  const persist = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) {
      pendingRef.current = true
      return savingRef.current
    }
    const once = async () => {
      setSaveState("saving")
      const current = docRef.current
      const res = await saveDraft(formId, {
        title: current.title.trim() || "Untitled form",
        mode: current.mode,
        schema: current.schema,
        theme: current.theme,
        settings: current.settings,
      })
      let okAll = res.ok
      if (!res.ok) {
        setSaveError(res.error)
      } else if (descRef.current !== savedDesc.current) {
        const meta = await updateFormMeta(formId, { description: descRef.current.slice(0, 500) })
        if (meta.ok) savedDesc.current = descRef.current
        else {
          okAll = false
          setSaveError(meta.error)
        }
      }
      if (okAll) {
        setSaveError(null)
        setUnpublished(true)
      }
      setSaveState(okAll ? "saved" : "error")
      return okAll
    }
    // Coalesce edits made while a save is in flight into one follow-up save.
    const run = (async () => {
      let result: boolean
      do {
        pendingRef.current = false
        result = await once()
      } while (pendingRef.current)
      return result
    })()
    savingRef.current = run
    const result = await run
    savingRef.current = null
    return result
  }, [formId])

  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setSaveState("dirty")
    const t = setTimeout(() => void persist(), 1000)
    return () => clearTimeout(t)
  }, [revision, description, persist])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving") e.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [saveState])

  /* ───────── field operations ───────── */
  const selected = useMemo(() => doc.schema.fields.find((f) => f.id === selectedId) ?? null, [doc.schema.fields, selectedId])

  const focusField = useCallback((id: string) => {
    setSelectedId(id)
    setInspectorTab("field")
    requestAnimationFrame(() =>
      document.querySelector(`[data-field-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    )
  }, [])

  const addField = useCallback(
    (type: FieldType, index?: number) => {
      const current = docRef.current.schema
      const field = createField(type, takenKeys(current))
      const at =
        index ?? (selectedId ? current.fields.findIndex((f) => f.id === selectedId) + 1 : endOfStepIndex(current, activeStep))
      update((d) => {
        const fields = [...d.schema.fields]
        fields.splice(Math.max(0, Math.min(at, fields.length)), 0, field)
        return { ...d, schema: { ...d.schema, fields } }
      })
      if (type === "step_break") setActiveStep(field.id)
      focusField(field.id)
    },
    [update, selectedId, activeStep, focusField]
  )

  const onPatch = useCallback(
    (id: string, patch: Partial<FormField>, key?: string) =>
      update((d) => ({ ...d, schema: patchField(d.schema, id, patch) }), key ?? `inline-${id}-${Object.keys(patch).join(",")}`),
    [update]
  )

  const onDuplicate = useCallback(
    (id: string) => {
      const r = duplicateField(docRef.current.schema, id)
      if (!r.field) return
      const copy = r.field
      update((d) => {
        const idx = d.schema.fields.findIndex((f) => f.id === id)
        const fields = [...d.schema.fields]
        fields.splice(idx === -1 ? fields.length : idx + 1, 0, copy)
        return { ...d, schema: { ...d.schema, fields } }
      })
      focusField(copy.id)
    },
    [update, focusField]
  )

  const onDelete = useCallback(
    (id: string) => {
      const field = docRef.current.schema.fields.find((f) => f.id === id)
      update((d) => ({ ...d, schema: removeField(d.schema, id) }))
      if (selectedId === id) setSelectedId(null)
      if (activeStep === id) setActiveStep("all")
      toast(`Deleted “${field?.label || "field"}”`, { action: { label: "Undo", onClick: () => undo() } })
    },
    [update, selectedId, activeStep, undo]
  )

  const onMove = useCallback((id: string, delta: number) => update((d) => ({ ...d, schema: moveFieldBy(d.schema, id, delta) })), [update])

  /* ───────── step operations ───────── */
  const [pendingStepDelete, setPendingStepDelete] = useState<{ id: string; title: string; count: number; index: number } | null>(null)

  const requestDeleteStep = useCallback((stepId: string) => {
    const steps = getSteps(docRef.current.schema)
    const index = steps.findIndex((s) => s.id === stepId)
    if (index === -1) return
    setPendingStepDelete({ id: stepId, title: steps[index].title, count: stepFieldIds(docRef.current.schema, stepId).length, index })
  }, [])

  const confirmDeleteStep = (keepFields: boolean) => {
    const p = pendingStepDelete
    if (!p) return
    const removedIds = keepFields ? [p.id] : [p.id, ...stepFieldIds(docRef.current.schema, p.id)]
    update((d) => ({ ...d, schema: deleteStep(d.schema, p.id, keepFields) }))
    setPendingStepDelete(null)
    setActiveStep("all")
    if (selectedId && removedIds.includes(selectedId)) setSelectedId(null)
    toast(keepFields ? `Merged “${p.title}” into the neighbouring step` : `Deleted step “${p.title}” and ${p.count} field${p.count === 1 ? "" : "s"}`, {
      action: { label: "Undo", onClick: () => undo() },
    })
  }

  const onAddStep = useCallback(() => {
    const current = docRef.current.schema
    const field = createField("step_break", takenKeys(current))
    const n = getSteps(current).length + 1
    const brk = { ...field, label: `Step ${n}` }
    update((d) => ({ ...d, schema: { ...d.schema, fields: [...d.schema.fields, brk] } }))
    setActiveStep(brk.id)
    setSelectedId(brk.id)
  }, [update])

  const onDuplicateStep = useCallback(
    (stepId: string) => {
      const steps = getSteps(docRef.current.schema)
      const title = steps.find((s) => s.id === stepId)?.title ?? "Step"
      const r = duplicateStep(docRef.current.schema, stepId, title)
      if (!r.stepId) return
      const nextSchema = r.schema
      update((d) => ({ ...d, schema: nextSchema }))
      setActiveStep(r.stepId)
      toast.success(`Duplicated “${title}”`, { action: { label: "Undo", onClick: () => undo() } })
    },
    [update, undo]
  )

  const onMoveStep = useCallback((stepId: string, delta: -1 | 1) => update((d) => ({ ...d, schema: moveStep(d.schema, stepId, delta) })), [update])

  const onRemoveStepBreaks = useCallback(() => {
    update((d) => ({ ...d, schema: removeAllStepBreaks(d.schema) }))
    setActiveStep("all")
    toast("Removed step breaks. All fields were kept.", { action: { label: "Undo", onClick: () => undo() } })
  }, [update, undo])

  const applyTemplate = (id: string) => {
    const t = getTemplate(id)
    if (!t) return
    const tpl = structuredClone(t)
    reset(
      {
        title: doc.title,
        mode: tpl.mode,
        schema: tpl.schema,
        theme: tpl.theme,
        settings: { ...tpl.settings, passwordEnabled: doc.settings.passwordEnabled },
      },
      true
    )
    setSelectedId(null)
    setActiveStep("all")
    toast.success(`Applied “${t.name}”`, { action: { label: "Undo", onClick: () => undo() } })
  }

  /* ───────── keyboard shortcuts ───────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (previewOpen) return
      const mod = e.metaKey || e.ctrlKey
      const typing = isTyping(e.target)
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void persist().then((ok) => ok && toast.success("Draft saved"))
        return
      }
      if (typing) return
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault()
        redo()
      } else if (mod && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault()
        onDuplicate(selectedId)
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        if (document.querySelector("[role=dialog], [role=alertdialog]")) return
        e.preventDefault()
        onDelete(selectedId)
      } else if (e.key === "Escape") {
        setSelectedId(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo, selectedId, onDuplicate, onDelete, persist, previewOpen])

  /* ───────── dnd ───────── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { from?: string; type?: FieldType } | undefined
    setDragType(data?.from === "palette" ? (data.type ?? null) : null)
  }
  const onDragEnd = (e: DragEndEvent) => {
    setDragType(null)
    const { active, over } = e
    const data = active.data.current as { from?: string; type?: FieldType } | undefined
    if (data?.from === "palette" && data.type) {
      if (!over) return
      const idx =
        over.id === CANVAS_DROP_ID
          ? endOfStepIndex(doc.schema, activeStep)
          : doc.schema.fields.findIndex((f) => f.id === over.id)
      addField(data.type, idx === -1 ? undefined : idx)
      return
    }
    if (over && active.id !== over.id && over.id !== CANVAS_DROP_ID) {
      update((d) => ({ ...d, schema: moveField(d.schema, String(active.id), String(over.id)) }))
    }
  }

  /* ───────── publish ───────── */
  const publish = () =>
    startPublish(async () => {
      const saved = await persist()
      if (!saved) return void toast.error("Fix the save error before publishing")
      const res = await publishForm(formId)
      if (!res.ok) return void toast.error(res.error)
      setStatus("PUBLISHED")
      setUnpublished(false)
      setPublishCount((c) => c + 1)
      toast.success(`Published version ${res.data.version}`, {
        description: `Live at /f/${res.data.slug}`,
        action: { label: "Open", onClick: () => window.open(`/f/${res.data.slug}`, "_blank") },
      })
      router.refresh()
    })

  const changeStatus = (next: "DRAFT" | "CLOSED" | "PUBLISHED") =>
    startPublish(async () => {
      const res = await setFormStatus(formId, next)
      if (!res.ok) return void toast.error(res.error)
      setStatus(next)
      toast.success(next === "CLOSED" ? "Form closed to new responses" : next === "DRAFT" ? "Form unpublished" : "Form reopened")
      router.refresh()
    })

  const logicTargets = useMemo(() => {
    const s = new Set<string>()
    for (const r of doc.schema.logic) {
      if (!r.enabled) continue
      r.conditions.forEach((c) => s.add(c.fieldId))
      r.actions.forEach((a) => a.targetFieldId && s.add(a.targetFieldId))
    }
    return s
  }, [doc.schema.logic])

  const keysExceptSelected = useMemo(() => (selected ? takenKeys(doc.schema, selected.id) : new Set<string>()), [doc.schema, selected])
  const questionCount = doc.schema.fields.filter(isInputField).length

  return (
    <div className="flex h-[calc(100svh-5.75rem)] min-h-[520px] flex-col">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Input
          value={doc.title}
          onChange={(e) => update((d) => ({ ...d, title: e.target.value.slice(0, 120) }), "title")}
          className="h-8 w-40 border-transparent px-2 font-medium shadow-none hover:border-input focus-visible:border-input lg:w-56"
          aria-label="Form title"
        />
        <Select value={doc.mode} onValueChange={(mode) => update((d) => ({ ...d, mode: mode as FormMode }))}>
          <SelectTrigger size="sm" className="w-auto gap-1.5" aria-label="Form mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORM_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Separator orientation="vertical" className="mx-1 hidden data-[orientation=vertical]:h-5 md:block" />
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={viewport}
          onValueChange={(v) => v && setViewport(v as Viewport)}
          className="hidden md:flex"
          aria-label="Canvas width"
        >
          <ToggleGroupItem value="desktop" aria-label="Desktop width">
            <MonitorIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="tablet" aria-label="Tablet width">
            <TabletIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="mobile" aria-label="Mobile width">
            <SmartphoneIcon />
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="hidden min-w-[7.5rem] text-xs text-muted-foreground tabular-nums lg:inline" aria-live="polite">
          {DEVICE_SCREEN[viewport].label} · {DEVICE_SCREEN[viewport].detail}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <SaveIndicator state={saveState} error={saveError} onRetry={() => void persist()} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" onClick={undo} disabled={!builder.canUndo} aria-label="Undo">
                <Undo2Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Undo <Kbd>⌘Z</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" onClick={redo} disabled={!builder.canRedo} aria-label="Redo">
                <Redo2Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Redo <Kbd>⇧⌘Z</Kbd>
            </TooltipContent>
          </Tooltip>
          <VersionsSheet
            formId={formId}
            publishCount={publishCount}
            onRestored={({ schema, theme }) => {
              reset({ ...docRef.current, schema, theme }, true)
              setSelectedId(null)
              setActiveStep("all")
            }}
          />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <EyeIcon /> <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
            <Link href={`/dashboard/forms/${formId}/share`}>
              <Share2Icon /> Share
            </Link>
          </Button>
          <div className="flex">
            <Button size="sm" className="rounded-r-none" onClick={publish} disabled={publishing}>
              {publishing ? <LoaderIcon className="animate-spin" /> : <RocketIcon />}
              {status === "PUBLISHED" && !unpublished ? "Published" : status === "PUBLISHED" ? "Publish changes" : "Publish"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="rounded-l-none border-l border-l-primary-foreground/20 px-1.5" aria-label="More publish options">
                  <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Status: {status === "PUBLISHED" ? "Live" : status === "CLOSED" ? "Closed" : "Draft"}
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={publish}>Publish latest draft</DropdownMenuItem>
                {status === "PUBLISHED" && <DropdownMenuItem onClick={() => changeStatus("CLOSED")}>Close to new responses</DropdownMenuItem>}
                {status === "CLOSED" && <DropdownMenuItem onClick={() => changeStatus("PUBLISHED")}>Reopen form</DropdownMenuItem>}
                {status !== "DRAFT" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => changeStatus("DRAFT")}>
                      Unpublish
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <DndContext id="form-builder-dnd" sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragType(null)}>
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="21" minSize="15" maxSize="32" className="min-w-0">
            <LeftPanel
              schema={doc.schema}
              mode={doc.mode}
              selectedId={selectedId}
              onAdd={(t) => addField(t)}
              onSelect={focusField}
              templates={TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, mode: t.mode, category: t.category }))}
              onApplyTemplate={applyTemplate}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="53" minSize="30" className="min-w-0">
            <BuilderCanvas
              formId={formId}
              slug={slug}
              title={doc.title}
              description={description}
              mode={doc.mode}
              schema={doc.schema}
              theme={doc.theme}
              viewport={viewport}
              activeStep={activeStep}
              onActiveStep={setActiveStep}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id)
                if (id) setInspectorTab((t) => (t === "theme" || t === "settings" ? "field" : t))
              }}
              onPatch={onPatch}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onMove={onMove}
              onTitle={(title) => update((d) => ({ ...d, title: title.slice(0, 120) }), "title")}
              onDescription={setDescription}
              allowBranding={features.customBranding}
              allowCustomCss={features.customCss}
              logicTargets={logicTargets}
              onAddStep={onAddStep}
              onDeleteStep={requestDeleteStep}
              onDuplicateStep={onDuplicateStep}
              onMoveStep={onMoveStep}
              onRemoveStepBreaks={onRemoveStepBreaks}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="26" minSize="20" maxSize="40" className="min-w-0">
            <Tabs value={inspectorTab} onValueChange={setInspectorTab} className="flex h-full min-h-0 flex-col gap-0">
              <div className="shrink-0 border-b px-4">
                <TabsList variant="line" className="h-11! w-full justify-start gap-4">
                  <TabsTrigger value="field">Field</TabsTrigger>
                  <TabsTrigger value="validation">Validation</TabsTrigger>
                  <TabsTrigger value="theme">Theme</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <TabsContent value="field" className="mt-0">
                  {selected ? (
                    <FieldInspector
                      key={selected.id}
                      field={selected}
                      mode={doc.mode}
                      takenKeys={keysExceptSelected}
                      onPatch={(patch, key) => onPatch(selected.id, patch, key)}
                      onDelete={() => onDelete(selected.id)}
                      onDuplicate={() => onDuplicate(selected.id)}
                    />
                  ) : (
                    <NothingSelected questionCount={questionCount} mode={doc.mode} />
                  )}
                </TabsContent>
                <TabsContent value="validation" className="mt-0">
                  {selected ? (
                    <ValidationInspector
                      key={selected.id}
                      field={selected}
                      fields={doc.schema.fields}
                      maxUploadMb={maxUploadMb}
                      onPatch={(patch, key) => onPatch(selected.id, patch, key)}
                    />
                  ) : (
                    <NothingSelected questionCount={questionCount} mode={doc.mode} />
                  )}
                </TabsContent>
                <TabsContent value="theme" className="mt-0">
                  <ThemeInspector
                    theme={doc.theme}
                    onChange={(patch, key) => update((d) => ({ ...d, theme: { ...d.theme, ...patch } }), key ? `theme-${key}` : undefined)}
                    allowBranding={features.customBranding}
                    allowCustomCss={features.customCss}
                  />
                </TabsContent>
                <TabsContent value="settings" className="mt-0 pb-6">
                  <SettingsInspector
                    formId={formId}
                    mode={doc.mode}
                    schema={doc.schema}
                    settings={doc.settings}
                    features={{ webhooks: features.webhooks, removeBadge: features.removeBadge }}
                    emailTemplates={emailTemplates}
                    onSettings={(patch, key) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }), key ? `settings-${key}` : undefined)}
                    onSchema={(fn, key) => update((d) => ({ ...d, schema: fn(d.schema) }), key ? `schema-${key}` : undefined)}
                  />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
        <DragOverlay dropAnimation={null}>{dragType ? <PaletteGhost type={dragType} /> : null}</DragOverlay>
      </DndContext>
      <AlertDialog open={!!pendingStepDelete} onOpenChange={(o) => !o && setPendingStepDelete(null)}>
        <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete step {pendingStepDelete ? pendingStepDelete.index + 1 : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingStepDelete?.title}” contains{" "}
              <span className="font-mono tabular-nums">{pendingStepDelete?.count ?? 0}</span> field{pendingStepDelete?.count === 1 ? "" : "s"}. Deleting the step removes them along with
              any logic rules that reference them. You can undo this right after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => confirmDeleteStep(true)}>
              Keep fields, remove step
            </Button>
            <AlertDialogAction variant="destructive" onClick={() => confirmDeleteStep(false)}>
              Delete step and fields
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        formId={formId}
        slug={slug}
        doc={doc}
        description={description}
        features={features}
        maxUploadMb={maxUploadMb}
      />
    </div>
  )
}

function SaveIndicator({ state, error, onRetry }: { state: SaveState; error: string | null; onRetry: () => void }) {
  if (state === "error")
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={onRetry}>
            <CircleAlertIcon /> <span className="hidden lg:inline">Save failed · retry</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{error ?? "Could not save"}</TooltipContent>
      </Tooltip>
    )
  return (
    <span
      className={cn("mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex", state === "saved" && "opacity-80")}
      aria-live="polite"
    >
      {state === "saving" ? (
        <>
          <LoaderIcon className="size-3.5 animate-spin" /> Saving…
        </>
      ) : state === "dirty" ? (
        <>
          <span className="size-1.5 rounded-full bg-amber-500" /> Unsaved
        </>
      ) : (
        <>
          <CloudCheckIcon className="size-3.5" /> Saved
        </>
      )}
    </span>
  )
}

function NothingSelected({ questionCount, mode }: { questionCount: number; mode: FormMode }) {
  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
        Select a field on the canvas to edit its label, options and validation.
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-muted/50 p-2.5">
          <dt className="text-muted-foreground">Questions</dt>
          <dd className="mt-0.5 text-base font-medium tabular-nums">{questionCount}</dd>
        </div>
        <div className="rounded-md bg-muted/50 p-2.5">
          <dt className="text-muted-foreground">Mode</dt>
          <dd className="mt-0.5 text-base font-medium">{MODE_LABELS[mode].split(" ")[0]}</dd>
        </div>
      </dl>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Undo / redo</span>
          <span>
            <Kbd>⌘Z</Kbd> <Kbd>⇧⌘Z</Kbd>
          </span>
        </div>
        <div className="flex justify-between">
          <span>Duplicate selected</span>
          <Kbd>⌘D</Kbd>
        </div>
        <div className="flex justify-between">
          <span>Delete selected</span>
          <Kbd>Del</Kbd>
        </div>
        <div className="flex justify-between">
          <span>Save now</span>
          <Kbd>⌘S</Kbd>
        </div>
      </div>
    </div>
  )
}
