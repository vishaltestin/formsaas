"use client"

import { forwardRef } from "react"
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  END_STEP_ID,
  FIELD_DEFINITIONS,
  isInputField,
  LOGIC_OPERATORS,
  uid,
  type FormField,
  type FormMode,
  type LogicAction,
  type LogicActionType,
  type LogicCondition,
  type LogicOperator,
  type LogicRule,
  type Step,
} from "@/lib/form-engine"
import { cn } from "@/lib/utils"

export const OPERATOR_LABELS: Record<LogicOperator, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  greater_than: "is greater than",
  less_than: "is less than",
  is_empty: "is empty",
  is_not_empty: "is not empty",
}

export const ACTION_LABELS: Record<LogicActionType, string> = {
  SHOW_FIELD: "Show field",
  HIDE_FIELD: "Hide field",
  REQUIRE_FIELD: "Require field",
  JUMP_TO_STEP: "Jump to step",
  SET_VALUE: "Set value / calculate",
  REDIRECT_OR_CUSTOM_THANK_YOU: "Redirect or custom ending",
}

const NUMERIC = new Set(["number", "rating", "scale"])

function fieldLabel(f: FormField) {
  return f.label || FIELD_DEFINITIONS[f.type].label
}

export function newCondition(fields: FormField[]): LogicCondition {
  const first = fields.find(isInputField)
  return { id: uid("c"), fieldId: first?.id ?? "", operator: "equals", value: "" }
}

export function newAction(type: LogicActionType = "SHOW_FIELD"): LogicAction {
  return { id: uid("a"), type }
}

export const RuleCard = forwardRef<
  HTMLDivElement,
  {
    rule: LogicRule
    index: number
    fields: FormField[]
    steps: Step[]
    mode: FormMode
    selected: boolean
    disabled: boolean
    onSelect: () => void
    onChange: (rule: LogicRule, coalesceKey?: string) => void
    onDelete: () => void
  }
>(function RuleCard({ rule, index, fields, steps, mode, selected, disabled, onSelect, onChange, onDelete }, ref) {
  const inputs = fields.filter(isInputField)
  const targetable = fields.filter((f) => f.type !== "step_break")
  const set = (patch: Partial<LogicRule>, key?: string) => onChange({ ...rule, ...patch }, key)
  const setCond = (i: number, patch: Partial<LogicCondition>, key?: string) =>
    set({ conditions: rule.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }, key)
  const setAction = (i: number, patch: Partial<LogicAction>, key?: string) =>
    set({ actions: rule.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) }, key)
  const multiStep = mode !== "CLASSIC" && steps.length > 1
  const incomplete =
    rule.conditions.length === 0 ||
    rule.actions.length === 0 ||
    rule.conditions.some((c) => !c.fieldId) ||
    rule.actions.some(
      (a) =>
        ((a.type === "SHOW_FIELD" || a.type === "HIDE_FIELD" || a.type === "REQUIRE_FIELD" || a.type === "SET_VALUE") && !a.targetFieldId) ||
        (a.type === "JUMP_TO_STEP" && !a.targetStepId)
    )

  return (
    <div
      ref={ref}
      onClick={onSelect}
      className={cn(
        "rounded-lg border bg-card transition-shadow",
        selected ? "ring-2 ring-ring/60" : "hover:border-foreground/20",
        !rule.enabled && "opacity-70"
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-[11px] font-medium tabular-nums">{index + 1}</span>
        <Input
          value={rule.name}
          onChange={(e) => set({ name: e.target.value }, `name-${rule.id}`)}
          className="h-7 border-transparent px-1.5 text-sm font-medium shadow-none hover:border-input focus-visible:border-input"
          aria-label="Rule name"
          disabled={disabled}
        />
        {incomplete && (
          <Badge variant="outline" className="shrink-0 border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400">
            incomplete
          </Badge>
        )}
        <Switch checked={rule.enabled} onCheckedChange={(enabled) => set({ enabled })} aria-label="Rule enabled" disabled={disabled} />
        <Button variant="ghost" size="icon" className="size-7 shrink-0 hover:text-destructive" onClick={onDelete} aria-label="Delete rule" disabled={disabled}>
          <Trash2Icon />
        </Button>
      </div>

      <fieldset disabled={disabled} className="space-y-3 p-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium tracking-wide text-muted-foreground uppercase">When</span>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={rule.combinator}
            onValueChange={(v) => v && set({ combinator: v as "AND" | "OR" })}
            disabled={disabled}
          >
            <ToggleGroupItem value="AND" className="h-6 px-2 text-xs">
              all match
            </ToggleGroupItem>
            <ToggleGroupItem value="OR" className="h-6 px-2 text-xs">
              any match
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          {rule.conditions.map((c, i) => {
            const field = fields.find((f) => f.id === c.fieldId)
            const needsValue = c.operator !== "is_empty" && c.operator !== "is_not_empty"
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-1.5">
                {i > 0 && <span className="w-full text-[10px] font-medium text-muted-foreground uppercase">{rule.combinator === "AND" ? "and" : "or"}</span>}
                <Select value={c.fieldId || undefined} onValueChange={(fieldId) => setCond(i, { fieldId, value: "" })}>
                  <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 basis-32 text-xs">
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    {steps.map((s, si) => {
                      const items = s.fields.filter(isInputField)
                      if (!items.length) return null
                      return (
                        <SelectGroup key={s.id}>
                          {steps.length > 1 && <SelectLabel className="text-[10px] uppercase">{si + 1}. {s.title || `Step ${si + 1}`}</SelectLabel>}
                          {items.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {fieldLabel(f)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )
                    })}
                  </SelectContent>
                </Select>
                <Select value={c.operator} onValueChange={(operator) => setCond(i, { operator: operator as LogicOperator })}>
                  <SelectTrigger size="sm" className="h-7 w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOGIC_OPERATORS.map((op) => (
                      <SelectItem key={op} value={op}>
                        {OPERATOR_LABELS[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {needsValue && <ValueInput field={field} value={c.value ?? ""} onChange={(value) => setCond(i, { value }, `cv-${c.id}`)} />}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="Remove condition"
                  onClick={() => set({ conditions: rule.conditions.filter((_, j) => j !== i) })}
                >
                  <XIcon />
                </Button>
              </div>
            )
          })}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => set({ conditions: [...rule.conditions, newCondition(fields)] })} disabled={!inputs.length}>
            <PlusIcon /> Condition
          </Button>
        </div>

        <div className="space-y-2 border-t pt-3">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Then</span>
          {rule.actions.map((a, i) => (
            <div key={a.id} className="space-y-1.5 rounded-md bg-muted/40 p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Select value={a.type} onValueChange={(type) => setAction(i, { ...newAction(type as LogicActionType), id: a.id })}>
                  <SelectTrigger size="sm" className="h-7 w-auto bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ACTION_LABELS) as LogicActionType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {ACTION_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {(a.type === "SHOW_FIELD" || a.type === "HIDE_FIELD" || a.type === "REQUIRE_FIELD" || a.type === "SET_VALUE") && (
                  <Select value={a.targetFieldId || undefined} onValueChange={(targetFieldId) => setAction(i, { targetFieldId })}>
                    <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 basis-32 bg-background text-xs">
                      <SelectValue placeholder="Target field" />
                    </SelectTrigger>
                    <SelectContent>
                      {(a.type === "SHOW_FIELD" || a.type === "HIDE_FIELD" ? targetable : inputs).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {fieldLabel(f)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {a.type === "JUMP_TO_STEP" && (
                  <Select value={a.targetStepId || undefined} onValueChange={(targetStepId) => setAction(i, { targetStepId })}>
                    <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 basis-32 bg-background text-xs">
                      <SelectValue placeholder="Target step" />
                    </SelectTrigger>
                    <SelectContent>
                      {steps.slice(1).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.index + 1}. {s.title || `Step ${s.index + 1}`}
                        </SelectItem>
                      ))}
                      <SelectItem value={END_STEP_ID}>End of form (submit)</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-7 shrink-0"
                  aria-label="Remove action"
                  onClick={() => set({ actions: rule.actions.filter((_, j) => j !== i) })}
                >
                  <XIcon />
                </Button>
              </div>

              {a.type === "JUMP_TO_STEP" && !multiStep && (
                <p className="text-xs text-muted-foreground">Jumps apply in Stepper, Card and Quiz modes with step breaks.</p>
              )}
              {a.type === "SET_VALUE" && (
                <div className="space-y-1.5">
                  <Input
                    className="h-7 bg-background font-mono text-xs"
                    placeholder={a.calculate ? "{{seats}} * 29" : "Value or {{piping}}"}
                    value={a.value ?? ""}
                    onChange={(e) => setAction(i, { value: e.target.value }, `av-${a.id}`)}
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={!!a.calculate} onCheckedChange={(calculate) => setAction(i, { calculate })} className="scale-90" />
                    Calculate (arithmetic with {"{{field_key}}"} and {"{{score}}"})
                  </label>
                </div>
              )}
              {a.type === "REDIRECT_OR_CUSTOM_THANK_YOU" && (
                <div className="space-y-1.5">
                  <Input
                    className="h-7 bg-background text-xs"
                    placeholder="Redirect URL (optional) — https://…"
                    value={a.redirectUrl ?? ""}
                    onChange={(e) => setAction(i, { redirectUrl: e.target.value }, `ru-${a.id}`)}
                  />
                  <Input
                    className="h-7 bg-background text-xs"
                    placeholder="Custom thank-you title"
                    value={a.thankYouTitle ?? ""}
                    onChange={(e) => setAction(i, { thankYouTitle: e.target.value }, `tt-${a.id}`)}
                  />
                  <Textarea
                    rows={2}
                    className="bg-background text-xs"
                    placeholder="Custom message — supports {{piping}}"
                    value={a.thankYouMessage ?? ""}
                    onChange={(e) => setAction(i, { thankYouMessage: e.target.value }, `tm-${a.id}`)}
                  />
                </div>
              )}
            </div>
          ))}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => set({ actions: [...rule.actions, newAction()] })}>
            <PlusIcon /> Action
          </Button>
        </div>
      </fieldset>
    </div>
  )
})

function ValueInput({ field, value, onChange }: { field?: FormField; value: string; onChange: (v: string) => void }) {
  if (field?.options?.length) {
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 basis-28 text-xs">
          <SelectValue placeholder="Value" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o.id} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (field?.type === "yes_no" || field?.type === "consent") {
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger size="sm" className="h-7 w-24 text-xs">
          <SelectValue placeholder="Value" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{field.type === "consent" ? "Checked" : field.props?.yesLabel || "Yes"}</SelectItem>
          <SelectItem value="false">{field.type === "consent" ? "Unchecked" : field.props?.noLabel || "No"}</SelectItem>
        </SelectContent>
      </Select>
    )
  }
  return (
    <Input
      className="h-7 min-w-0 flex-1 basis-24 text-xs"
      type={field && NUMERIC.has(field.type) ? "number" : field?.type === "date" ? "date" : "text"}
      placeholder="Value"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
