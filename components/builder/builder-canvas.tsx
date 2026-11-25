"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CopyIcon,
  EllipsisIcon,
  EyeOffIcon,
  GripVerticalIcon,
  InfoIcon,
  ListXIcon,
  MousePointerClickIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { FieldControl } from "@/components/renderer/field-control"
import { FieldShell, LayoutBlock, widthClass } from "@/components/renderer/field-block"
import { ThemeScope } from "@/components/renderer/theme-scope"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  FIELD_DEFINITIONS,
  getSteps,
  isInputField,
  START_STEP_ID,
  type FormField,
  type FormMode,
  type FormSchema,
  type ThemeConfig,
} from "@/lib/form-engine"
import { cn } from "@/lib/utils"

import { APP_HOST, deviceOuterWidth, DeviceFrame, type Viewport } from "./device-frame"
import { stepMap } from "./ops"

export type { Viewport }

export const CANVAS_DROP_ID = "canvas-drop"

/** Zoom applied to the tablet / phone frame; sortable transforms are divided by it so drags track the pointer. */
const CanvasScale = createContext(1)

/** Scales the device down (CSS zoom) when the canvas is narrower than the device. */
function useFitScale(viewport: Viewport) {
  const [width, setWidth] = useState(0)
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const need = deviceOuterWidth(viewport)
  const scale = viewport === "desktop" || width === 0 ? 1 : Math.max(0.5, Math.min(1, width / need))
  return { ref, scale: Math.round(scale * 100) / 100 }
}

interface CanvasProps {
  formId: string
  slug: string
  title: string
  description: string
  mode: FormMode
  schema: FormSchema
  theme: ThemeConfig
  viewport: Viewport
  activeStep: string
  onActiveStep: (id: string) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  onPatch: (id: string, patch: Partial<FormField>) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, delta: number) => void
  onTitle: (title: string) => void
  onDescription: (description: string) => void
  allowBranding: boolean
  allowCustomCss: boolean
  logicTargets: Set<string>
  onAddStep: () => void
  onDeleteStep: (stepId: string) => void
  onDuplicateStep: (stepId: string) => void
  onMoveStep: (stepId: string, delta: -1 | 1) => void
  onRemoveStepBreaks: () => void
}

export function BuilderCanvas(props: CanvasProps) {
  const {
    formId,
    mode,
    schema,
    theme,
    viewport,
    activeStep,
    onActiveStep,
    selectedId,
    onSelect,
    allowBranding,
    allowCustomCss,
  } = props

  const steps = useMemo(() => getSteps(schema), [schema])
  const map = useMemo(() => stepMap(schema), [schema])
  const stepMode = mode === "STEPPER" || mode === "QUIZ"
  const stepped = stepMode && steps.length > 1
  const strayBreaks = stepMode ? 0 : schema.fields.filter((f) => f.type === "step_break").length
  const activeIdx = steps.findIndex((s) => s.id === activeStep)
  const active = activeIdx >= 0 ? steps[activeIdx] : null
  const visibleFields = useMemo(
    () => (stepped && activeStep !== "all" ? schema.fields.filter((f) => map[f.id] === activeStep) : schema.fields),
    [schema.fields, stepped, activeStep, map]
  )
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROP_ID })
  const { ref: fitRef, scale } = useFitScale(viewport)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {stepMode && (
        <div className="flex shrink-0 items-center gap-1 border-b bg-background px-3 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {stepped && (
              <StepTab active={activeStep === "all"} onClick={() => onActiveStep("all")}>
                All steps
              </StepTab>
            )}
            {stepped &&
              steps.map((s, i) => (
                <StepTab key={s.id} active={activeStep === s.id} onClick={() => onActiveStep(s.id)}>
                  <span className="font-mono text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="max-w-[10rem] truncate">{s.title || `Step ${i + 1}`}</span>
                </StepTab>
              ))}
            {!stepped && <span className="px-1 text-xs text-muted-foreground">Single step. Add a step to split this form into pages.</span>}
          </div>
          {active && stepped && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" aria-label="Step actions">
                  <EllipsisIcon /> Step {activeIdx + 1}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate text-xs">{active.title}</DropdownMenuLabel>
                {active.id !== START_STEP_ID && (
                  <DropdownMenuItem onSelect={() => onSelect(active.id)}>
                    <PencilIcon /> Rename step
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => props.onDuplicateStep(active.id)} disabled={active.fields.length === 0 && active.id === START_STEP_ID}>
                  <CopyIcon /> Duplicate step
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => props.onMoveStep(active.id, -1)}
                  disabled={active.id === START_STEP_ID || activeIdx === 0 || steps[activeIdx - 1]?.id === START_STEP_ID}
                >
                  <ArrowLeftIcon /> Move earlier
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => props.onMoveStep(active.id, 1)} disabled={active.id === START_STEP_ID || activeIdx === steps.length - 1}>
                  <ArrowRightIcon /> Move later
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => props.onDeleteStep(active.id)}>
                  <Trash2Icon /> Delete step…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={props.onAddStep}>
            <PlusIcon /> Add step
          </Button>
        </div>
      )}
      {strayBreaks > 0 && (
        <Alert className="m-3 mb-0 w-auto shrink-0 rounded-md py-2">
          <InfoIcon />
          <AlertDescription className="text-xs">
            {strayBreaks} step break{strayBreaks === 1 ? "" : "s"} {mode === "CARD" ? "are ignored in Card mode" : "show as section titles in Classic mode"}. Steps only apply to
            Stepper and Quiz forms.
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={props.onRemoveStepBreaks}>
              Remove breaks
            </Button>
          </AlertAction>
        </Alert>
      )}
      <div ref={fitRef} className="min-h-0 flex-1 overflow-auto bg-muted/60 p-3 md:p-5" onClick={() => onSelect(null)} data-viewport={viewport}>
        <DeviceFrame viewport={viewport} url={`${APP_HOST}/f/${props.slug}`} scale={scale} screenStyle={{ background: theme.colors.background }}>
          <CanvasScale.Provider value={scale}>
          <ThemeScope theme={theme} scopeId={`builder-${formId}`} allowCustomCss={allowCustomCss} className="@container min-h-full">
            <div className="px-4 py-8 @2xl:py-12">
              <div className="mx-auto w-full" style={{ maxWidth: "var(--fs-max-width)" }}>
                {allowBranding && theme.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={theme.coverUrl}
                    alt=""
                    className="mb-[-1px] h-36 w-full object-cover"
                    style={{ borderTopLeftRadius: "calc(var(--fs-radius) + 4px)", borderTopRightRadius: "calc(var(--fs-radius) + 4px)" }}
                  />
                )}
                <div
                  className="fs-card relative p-6 @xl:p-9"
                  style={allowBranding && theme.coverUrl ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : undefined}
                >
                  {allowBranding && theme.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={theme.logoUrl} alt="" className="mb-5 h-10 w-auto object-contain" />
                  )}
                  <textarea
                    value={props.title}
                    rows={1}
                    onChange={(e) => props.onTitle(e.target.value.replace(/[\r\n]+/g, " "))}
                    onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                    onClick={(e) => e.stopPropagation()}
                    className="fs-heading w-full resize-none border-0 bg-transparent p-0 outline-none field-sizing-content"
                    style={{ color: "inherit" }}
                    aria-label="Form title"
                    placeholder="Form title"
                  />
                  <textarea
                    value={props.description}
                    onChange={(e) => props.onDescription(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    rows={Math.max(1, Math.ceil(props.description.length / 80))}
                    className="fs-muted mt-2 mb-7 w-full resize-none border-0 bg-transparent p-0 outline-none field-sizing-content"
                    placeholder="Add a description (optional)"
                    aria-label="Form description"
                  />

                  <div
                    ref={setNodeRef}
                    className={cn(
                      "rounded-lg transition-colors",
                      isOver && "bg-[color-mix(in_srgb,var(--fs-primary)_6%,transparent)]",
                      visibleFields.length === 0 && "border border-dashed"
                    )}
                  >
                    {visibleFields.length === 0 ? (
                      <div className="fs-muted flex flex-col items-center gap-2 px-6 py-14 text-center text-sm">
                        <MousePointerClickIcon className="size-5" />
                        <p>Drag a field here, or click one in the library to add it.</p>
                      </div>
                    ) : (
                      <SortableContext items={visibleFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                        <div className="grid grid-cols-12 gap-x-4" style={{ rowGap: "calc(var(--fs-gap) * 0.6)" }}>
                          {visibleFields.map((f) => (
                            <SortableField
                              key={f.id}
                              field={f}
                              stepNumber={f.type === "step_break" ? steps.findIndex((s) => s.id === f.id) + 1 : 0}
                              selected={selectedId === f.id}
                              hasLogic={props.logicTargets.has(f.id)}
                              onSelect={() => onSelect(f.id)}
                              onPatch={(p) => props.onPatch(f.id, p)}
                              onDuplicate={() => props.onDuplicate(f.id)}
                              onDelete={() => props.onDelete(f.id)}
                              onMove={(d) => props.onMove(f.id, d)}
                              onDeleteStep={f.type === "step_break" && stepMode ? () => props.onDeleteStep(f.id) : undefined}
                              mode={mode}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    )}
                  </div>

                  <div className="mt-8 flex items-center gap-3">
                    <span className="fs-button pointer-events-none">
                      {stepped ? schema.stepper.nextLabel || "Next" : theme.buttonText || "Submit"}
                    </span>
                    {stepped && activeStep !== "all" && activeStep !== START_STEP_ID && (
                      <span className="fs-button fs-button-ghost pointer-events-none">{schema.stepper.backLabel || "Back"}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </ThemeScope>
          </CanvasScale.Provider>
        </DeviceFrame>
      </div>
    </div>
  )
}

function StepTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
        active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function SortableField({
  field,
  stepNumber,
  selected,
  hasLogic,
  onSelect,
  onPatch,
  onDuplicate,
  onDelete,
  onMove,
  onDeleteStep,
  mode,
}: {
  field: FormField
  onDeleteStep?: () => void
  stepNumber: number
  selected: boolean
  hasLogic: boolean
  onSelect: () => void
  onPatch: (p: Partial<FormField>) => void
  onDuplicate: () => void
  onDelete: () => void
  onMove: (delta: number) => void
  mode: FormMode
}) {
  const scale = useContext(CanvasScale)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: { from: "canvas" },
  })
  const def = FIELD_DEFINITIONS[field.type]
  const isStep = field.type === "step_break"

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform && { ...transform, x: transform.x / scale, y: transform.y / scale }), transition }}
      className={cn(isStep ? "col-span-12" : widthClass(field.width), "group/field relative", isDragging && "z-10 opacity-60")}
      data-field-id={field.id}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Select ${field.label || def.label}`}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect()
          }
        }}
        className={cn(
          "relative -mx-3 cursor-pointer rounded-lg px-3 py-3 outline-none",
          "ring-offset-0 transition-shadow hover:ring-1 hover:ring-[color-mix(in_srgb,var(--fs-primary)_35%,transparent)]",
          "focus-visible:ring-2 focus-visible:ring-[var(--fs-primary)]",
          selected && "ring-2 ring-[var(--fs-primary)] hover:ring-2 hover:ring-[var(--fs-primary)]"
        )}
      >
        {/* floating toolbar */}
        <div
          className={cn(
            "absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-md border bg-popover p-0.5 text-popover-foreground shadow-xs",
            "opacity-0 transition-opacity group-hover/field:opacity-100 group-focus-within/field:opacity-100",
            selected && "opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="grid size-6 cursor-grab place-items-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-3.5" />
          </button>
          <span className="px-1 text-[11px] font-medium text-muted-foreground">{def.label}</span>
          {hasLogic && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">logic</span>}
          <ToolButton label="Move up" onClick={() => onMove(-1)}>
            <ArrowUpIcon />
          </ToolButton>
          <ToolButton label="Move down" onClick={() => onMove(1)}>
            <ArrowDownIcon />
          </ToolButton>
          <ToolButton label="Duplicate (⌘D)" onClick={onDuplicate}>
            <CopyIcon />
          </ToolButton>
          <ToolButton label={isStep && onDeleteStep ? "Remove break (keep fields)" : "Delete (Del)"} onClick={onDelete} destructive>
            <Trash2Icon />
          </ToolButton>
          {isStep && onDeleteStep && (
            <ToolButton label="Delete step and its fields" onClick={onDeleteStep} destructive>
              <ListXIcon />
            </ToolButton>
          )}
        </div>

        <FieldPreview field={field} stepNumber={stepNumber} onPatch={onPatch} mode={mode} />
      </div>
    </div>
  )
}

function ToolButton({
  label,
  onClick,
  children,
  destructive,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  destructive?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={label}
          onClick={onClick}
          className={cn("size-6 [&_svg]:size-3.5", destructive && "hover:text-destructive")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

function FieldPreview({
  field,
  stepNumber,
  onPatch,
  mode,
}: {
  field: FormField
  stepNumber: number
  onPatch: (p: Partial<FormField>) => void
  mode: FormMode
}) {
  if (field.type === "step_break") {
    return (
      <div className="flex items-center gap-3 py-1">
        <span className="fs-badge shrink-0 font-medium">
          {mode === "CLASSIC" ? "Section" : `Step ${stepNumber}`}
        </span>
        <input
          value={field.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="fs-h3 min-w-0 flex-1 border-0 bg-transparent p-0 outline-none"
          style={{ color: "inherit" }}
          placeholder="Step title"
        />
        <hr className="fs-divider hidden w-16 sm:block" />
      </div>
    )
  }
  if (field.type === "hidden") {
    return (
      <div className="fs-muted flex items-center gap-2 text-sm">
        <EyeOffIcon className="size-4" />
        <span>
          Hidden field <strong style={{ color: "var(--fs-text)" }}>{field.label}</strong> · reads{" "}
          <code>?{field.props?.paramName || field.key}=</code>
        </span>
      </div>
    )
  }
  if (!isInputField(field)) return <LayoutBlock field={field} design onPatch={onPatch} />
  return (
    <FieldShell field={field} required={field.required} design onPatch={onPatch}>
      <FieldControl field={field} value={field.defaultValue ?? null} onChange={() => {}} design showKeys={mode === "CARD"} />
    </FieldShell>
  )
}
