"use client"

import { useMemo } from "react"
import { InfoIcon } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { FORMAT_RULES, isInputField, type CrossFieldOperator, type FieldValidation, type FormField } from "@/lib/form-engine"

import { NumberInput, Row, SectionTitle, SwitchRow } from "./inspector-controls"

const ID_FORMATS = ["pan", "gstin", "aadhaar", "ifsc", "pincode_in", "zip_us", "postcode_uk", "iban"] as const

const TEXT_TYPES = new Set(["short_text", "long_text", "email", "phone", "url", "password"])
const MULTI_TYPES = new Set(["checkboxes", "multi_select"])
const COMPARABLE = new Set(["short_text", "email", "number", "date", "time", "password", "phone", "url", "select", "radio", "scale", "rating", "currency", "slider", "country", "datetime"])

const CROSS_OPS: { value: CrossFieldOperator; label: string }[] = [
  { value: "equals", label: "must equal" },
  { value: "not_equals", label: "must not equal" },
  { value: "gt", label: "must be greater than" },
  { value: "gte", label: "must be ≥" },
  { value: "lt", label: "must be less than" },
  { value: "lte", label: "must be ≤" },
]

const FILE_PRESETS = [
  { label: "Images", value: "image/*" },
  { label: "PDF", value: "application/pdf" },
  { label: "Word", value: ".doc,.docx" },
  { label: "Spreadsheets", value: ".csv,.xls,.xlsx" },
  { label: "Text", value: "text/plain" },
  { label: "Zip", value: ".zip" },
]

export function ValidationInspector({
  field,
  fields,
  maxUploadMb,
  onPatch,
}: {
  field: FormField
  fields: FormField[]
  maxUploadMb: number
  onPatch: (patch: Partial<FormField>, coalesceKey?: string) => void
}) {
  const v = field.validation ?? {}
  const set = (patch: Partial<FieldValidation>, key?: string) => onPatch({ validation: { ...v, ...patch } }, key)
  const setMsg = (k: keyof NonNullable<FieldValidation["messages"]>, value: string) =>
    set({ messages: { ...(v.messages ?? {}), [k]: value || undefined } }, `msg-${k}`)
  const id = (s: string) => `val-${field.id}-${s}`

  const regexError = useMemo(() => {
    if (!v.pattern) return null
    try {
      new RegExp(v.pattern)
      return null
    } catch (e) {
      return (e as Error).message
    }
  }, [v.pattern])

  const others = fields.filter((f) => f.id !== field.id && isInputField(f) && COMPARABLE.has(f.type))
  const isText = TEXT_TYPES.has(field.type)
  const messageKeys: (keyof NonNullable<FieldValidation["messages"]>)[] = ["required"]
  if (isText) messageKeys.push("minLength", "maxLength", "pattern")
  if (field.type === "short_text") messageKeys.push("format")
  if (field.type === "email") messageKeys.push("format")
  if (field.type === "number" || field.type === "currency") messageKeys.push("min", "max")
  if (field.type === "date" || field.type === "datetime" || field.type === "date_range") messageKeys.push("date")
  if (field.type === "file") messageKeys.push("file")
  if (MULTI_TYPES.has(field.type)) messageKeys.push("selection")

  if (!isInputField(field) || field.type === "hidden" || field.type === "calculated")
    return (
      <div className="p-4">
        <Alert>
          <InfoIcon />
          <AlertDescription className="text-xs">
            {field.type === "hidden"
              ? "Hidden fields are filled from the URL and aren’t validated."
              : field.type === "calculated"
                ? "Calculated fields are computed from the formula on the server, so respondents can’t edit or tamper with them."
                : "Layout blocks don’t collect answers, so there’s nothing to validate."}
          </AlertDescription>
        </Alert>
      </div>
    )

  return (
    <div className="space-y-5 p-4">
      <p className="text-xs text-muted-foreground">
        Rules run in the browser and again on the server using the same schema, so they can’t be bypassed.
      </p>

      {isText && (
        <div className="space-y-4">
          <SectionTitle>Length</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Min characters" htmlFor={id("minl")}>
              <NumberInput id={id("minl")} value={v.minLength} min={0} onChange={(minLength) => set({ minLength }, "minl")} />
            </Row>
            <Row label="Max characters" htmlFor={id("maxl")}>
              <NumberInput id={id("maxl")} value={v.maxLength} min={1} onChange={(maxLength) => set({ maxLength }, "maxl")} />
            </Row>
          </div>
          {field.type === "short_text" && (
            <Row label="Format">
              <Select value={v.format ?? "none"} onValueChange={(format) => set({ format: format as FieldValidation["format"] })}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any text</SelectItem>
                  <SelectItem value="email">Email address</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="phone">Phone number</SelectItem>
                  <SelectItem value="alphanumeric">Letters & numbers only</SelectItem>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Identity & postal (checksum-verified)</SelectLabel>
                    {ID_FORMATS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FORMAT_RULES[f].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Row>
          )}
          {field.type === "short_text" && v.format && ID_FORMATS.includes(v.format as (typeof ID_FORMATS)[number]) && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Example: <code className="font-mono">{FORMAT_RULES[v.format as (typeof ID_FORMATS)[number]].example}</code>
            </p>
          )}
          {field.type === "email" && (
            <SwitchRow
              id={id("biz")}
              label="Work email only"
              description="Rejects Gmail, Outlook, Yahoo, iCloud and other free mailbox providers."
              checked={!!v.businessEmail}
              onChange={(businessEmail) => set({ businessEmail: businessEmail || undefined })}
            />
          )}
          <Row label="Custom pattern (regex)" htmlFor={id("re")} description="e.g. ^[A-Z]{2}-\d{4}$ for codes like AB-1234">
            <Input
              id={id("re")}
              className="h-8 font-mono text-xs"
              value={v.pattern ?? ""}
              aria-invalid={!!regexError || undefined}
              onChange={(e) => set({ pattern: e.target.value || undefined }, "re")}
            />
            {regexError && <FieldError className="text-xs">{regexError}</FieldError>}
          </Row>
        </div>
      )}

      {(field.type === "number" || field.type === "currency") && (
        <div className="space-y-3">
          <SectionTitle>Range</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Minimum" htmlFor={id("min")}>
              <NumberInput id={id("min")} value={v.min} onChange={(min) => set({ min }, "min")} />
            </Row>
            <Row label="Maximum" htmlFor={id("max")}>
              <NumberInput id={id("max")} value={v.max} onChange={(max) => set({ max }, "max")} />
            </Row>
          </div>
        </div>
      )}

      {(field.type === "date" || field.type === "datetime" || field.type === "date_range") && (
        <div className="space-y-3">
          <SectionTitle>Date bounds</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Earliest" htmlFor={id("dmin")}>
              <Input id={id("dmin")} type="date" className="h-8" value={v.dateMin ?? ""} onChange={(e) => set({ dateMin: e.target.value || undefined })} />
            </Row>
            <Row label="Latest" htmlFor={id("dmax")}>
              <Input id={id("dmax")} type="date" className="h-8" value={v.dateMax ?? ""} onChange={(e) => set({ dateMax: e.target.value || undefined })} />
            </Row>
          </div>
          <Row label="Relative rule">
            <Select value={v.dateRule ?? "any"} onValueChange={(dateRule) => set({ dateRule: dateRule as FieldValidation["dateRule"] })}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any date</SelectItem>
                <SelectItem value="past">Today or earlier</SelectItem>
                <SelectItem value="future">Today or later</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          {field.type === "date" && (
            <div className="grid grid-cols-2 gap-2">
              <Row label="Minimum age" htmlFor={id("amin")} description="For date of birth">
                <NumberInput id={id("amin")} value={v.minAge} min={0} max={120} onChange={(minAge) => set({ minAge }, "amin")} />
              </Row>
              <Row label="Maximum age" htmlFor={id("amax")}>
                <NumberInput id={id("amax")} value={v.maxAge} min={0} max={130} onChange={(maxAge) => set({ maxAge }, "amax")} />
              </Row>
            </div>
          )}
        </div>
      )}

      {field.type === "file" && (
        <div className="space-y-3">
          <SectionTitle>Files</SectionTitle>
          <Row label="Max size (MB)" htmlFor={id("mb")} description={`Your plan allows up to ${maxUploadMb} MB per file.`}>
            <NumberInput
              id={id("mb")}
              value={v.maxFileMb}
              min={0.1}
              max={maxUploadMb}
              step={0.5}
              placeholder={String(maxUploadMb)}
              onChange={(maxFileMb) => set({ maxFileMb: maxFileMb === undefined ? undefined : Math.min(maxFileMb, maxUploadMb) }, "mb")}
            />
          </Row>
          <Row label="Allowed types" description="Leave all unselected to accept any file.">
            <div className="flex flex-wrap gap-1.5">
              {FILE_PRESETS.map((p) => {
                const on = (v.accept ?? []).includes(p.value)
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() =>
                      set({ accept: on ? (v.accept ?? []).filter((x) => x !== p.value) : [...(v.accept ?? []), p.value] })
                    }
                    className={
                      on
                        ? "rounded-md border border-foreground bg-foreground px-2 py-1 text-xs text-background"
                        : "rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    }
                    aria-pressed={on}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </Row>
        </div>
      )}

      {MULTI_TYPES.has(field.type) && (
        <div className="space-y-3">
          <SectionTitle>Selections</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Row label="At least" htmlFor={id("mins")}>
              <NumberInput id={id("mins")} value={v.minSelected} min={0} onChange={(minSelected) => set({ minSelected }, "mins")} />
            </Row>
            <Row label="At most" htmlFor={id("maxs")}>
              <NumberInput id={id("maxs")} value={v.maxSelected} min={1} onChange={(maxSelected) => set({ maxSelected }, "maxs")} />
            </Row>
          </div>
        </div>
      )}

      {COMPARABLE.has(field.type) && others.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <SectionTitle>Compare with another field</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={v.crossField?.operator ?? "none"}
                onValueChange={(op) =>
                  set({
                    crossField:
                      op === "none"
                        ? undefined
                        : { operator: op as CrossFieldOperator, fieldId: v.crossField?.fieldId ?? others[0].id, message: v.crossField?.message },
                  })
                }
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="No rule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No rule</SelectItem>
                  {CROSS_OPS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={v.crossField?.fieldId ?? ""}
                disabled={!v.crossField}
                onValueChange={(fieldId) => v.crossField && set({ crossField: { ...v.crossField, fieldId } })}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Field" />
                </SelectTrigger>
                <SelectContent>
                  {others.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label || f.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {v.crossField && (
              <Input
                className="h-8"
                placeholder="Error message, e.g. Emails don’t match"
                value={v.crossField.message ?? ""}
                onChange={(e) => v.crossField && set({ crossField: { ...v.crossField, message: e.target.value } }, "xmsg")}
              />
            )}
          </div>
        </>
      )}

      <Separator />
      <Accordion type="single" collapsible>
        <AccordionItem value="messages" className="border-0">
          <AccordionTrigger className="py-1 text-xs font-medium hover:no-underline">Custom error messages</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-3">
            {messageKeys.map((k) => (
              <Row key={k} label={k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} htmlFor={id(`m-${k}`)}>
                <Input
                  id={id(`m-${k}`)}
                  className="h-8"
                  placeholder="Use default message"
                  value={v.messages?.[k] ?? ""}
                  onChange={(e) => setMsg(k, e.target.value)}
                />
              </Row>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
