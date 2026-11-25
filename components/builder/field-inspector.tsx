"use client"

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  appointmentSlots,
  COUNTRIES,
  countryByCode,
  CURRENCIES,
  FIELD_DEFINITIONS,
  FORMULA_FUNCTIONS,
  PRIORITY_COUNTRIES,
  videoEmbedUrl,
  formulaError,
  isInputField,
  slugifyKey,
  uid,
  uniqueKey,
  type FieldOption,
  type FieldProps,
  type FormField,
  type FormMode,
  type MatrixItem,
} from "@/lib/form-engine"

import { FIELD_ICONS } from "./left-panel"
import { NumberInput, readImage, Row, SectionTitle, SwitchRow } from "./inspector-controls"

const PLACEHOLDER_TYPES = new Set(["short_text", "long_text", "email", "phone", "number", "url", "password", "select", "multi_select", "country", "currency"])

const WEEKDAYS = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 0, l: "Sun" },
]

function CountrySelect({ id, value, onChange, allowNone }: { id: string; value: string; onChange: (code: string) => void; allowNone?: boolean }) {
  return (
    <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
      <SelectTrigger id={id} size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {allowNone && <SelectItem value="__none">No default</SelectItem>}
        <SelectGroup>
          <SelectLabel>Common</SelectLabel>
          {PRIORITY_COUNTRIES.map((c) => (
            <SelectItem key={`p-${c}`} value={c}>
              {countryByCode(c)?.[1]} <span className="font-mono text-muted-foreground">+{countryByCode(c)?.[2]}</span>
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>All countries</SelectLabel>
          {COUNTRIES.filter(([c]) => !(PRIORITY_COUNTRIES as readonly string[]).includes(c)).map(([c, name, dial]) => (
            <SelectItem key={c} value={c}>
              {name} <span className="font-mono text-muted-foreground">+{dial}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function FieldInspector({
  field,
  mode,
  takenKeys,
  onPatch,
  onDelete,
  onDuplicate,
}: {
  field: FormField
  mode: FormMode
  takenKeys: Set<string>
  onPatch: (patch: Partial<FormField>, coalesceKey?: string) => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const def = FIELD_DEFINITIONS[field.type]
  const Icon = FIELD_ICONS[field.type]
  const input = isInputField(field)
  const p = field.props ?? {}
  const setProps = (patch: Partial<FieldProps>, key?: string) => onPatch({ props: { ...p, ...patch } }, key)
  const keyTaken = input && takenKeys.has(field.key)
  const id = (s: string) => `insp-${field.id}-${s}`

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-2">
        <div className="grid size-8 place-items-center rounded-md border bg-muted/40">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{def.label}</div>
          <div className="truncate text-xs text-muted-foreground">{def.description}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button size="icon" variant="ghost" className="size-8 hover:text-destructive" onClick={onDelete} aria-label="Delete field">
          <Trash2Icon />
        </Button>
      </div>

      {field.type !== "divider" && field.type !== "paragraph" && field.type !== "image" && (
        <Row label={field.type === "step_break" ? "Step title" : field.type === "heading" ? "Heading" : "Label"} htmlFor={id("label")}>
          <Input
            id={id("label")}
            className="h-8"
            value={field.label}
            onChange={(e) => onPatch({ label: e.target.value }, `label-${field.id}`)}
          />
        </Row>
      )}

      {input && (
        <Row
          label="Field key"
          htmlFor={id("key")}
          description="Used in exports, webhooks, URL params and {{piping}}."
        >
          <Input
            id={id("key")}
            className="h-8 font-mono text-xs"
            value={field.key}
            aria-invalid={keyTaken || undefined}
            onChange={(e) =>
              onPatch({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 48) }, `key-${field.id}`)
            }
            onBlur={() => {
              const clean = slugifyKey(field.key) || "field"
              const next = takenKeys.has(clean) ? uniqueKey(clean, takenKeys) : clean
              if (next !== field.key) onPatch({ key: next })
            }}
          />
          {keyTaken && <FieldError className="text-xs">This key is already used by another field.</FieldError>}
        </Row>
      )}

      {(field.type === "paragraph" || field.type === "heading" || field.type === "step_break") && (
        <Row label={field.type === "paragraph" ? "Text" : "Subtitle"} htmlFor={id("content")}>
          <Textarea
            id={id("content")}
            rows={field.type === "paragraph" ? 5 : 2}
            value={p.content ?? ""}
            onChange={(e) => setProps({ content: e.target.value }, `content-${field.id}`)}
          />
        </Row>
      )}

      {field.type === "heading" && (
        <Row label="Size">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={String(p.level ?? 2)}
            onValueChange={(v) => v && setProps({ level: Number(v) as 1 | 2 | 3 })}
          >
            <ToggleGroupItem value="1">Large</ToggleGroupItem>
            <ToggleGroupItem value="2">Medium</ToggleGroupItem>
            <ToggleGroupItem value="3">Small</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      )}

      {field.type === "image" && <ImageProps field={field} setProps={setProps} />}

      {PLACEHOLDER_TYPES.has(field.type) && (
        <Row label="Placeholder" htmlFor={id("ph")}>
          <Input
            id={id("ph")}
            className="h-8"
            value={field.placeholder ?? ""}
            onChange={(e) => onPatch({ placeholder: e.target.value }, `ph-${field.id}`)}
          />
        </Row>
      )}

      {input && field.type !== "hidden" && (
        <Row label="Help text" htmlFor={id("help")}>
          <Input
            id={id("help")}
            className="h-8"
            value={field.helpText ?? ""}
            onChange={(e) => onPatch({ helpText: e.target.value }, `help-${field.id}`)}
          />
        </Row>
      )}

      {input && field.type !== "hidden" && field.type !== "calculated" && (
        <SwitchRow
          id={id("req")}
          label="Required"
          description="Respondents must answer before continuing."
          checked={!!field.required}
          onChange={(required) => onPatch({ required })}
        />
      )}

      {field.type !== "step_break" && field.type !== "hidden" && (
        <Row label="Width" description="Place half or third width fields side by side to build columns.">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={field.width ?? "full"}
            onValueChange={(v) => v && onPatch({ width: v as FormField["width"] })}
          >
            <ToggleGroupItem value="full">Full</ToggleGroupItem>
            <ToggleGroupItem value="half">1/2</ToggleGroupItem>
            <ToggleGroupItem value="third">1/3</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      )}

      {def.hasOptions && (
        <>
          <Separator />
          <OptionsEditor field={field} mode={mode} onChange={(options) => onPatch({ options }, `opts-${field.id}`)} />
        </>
      )}

      <TypeProps field={field} setProps={setProps} onPatch={onPatch} otherKeys={takenKeys} />
    </div>
  )
}

function TypeProps({
  field,
  setProps,
  onPatch,
  otherKeys,
}: {
  otherKeys: Set<string>
  field: FormField
  setProps: (patch: Partial<FieldProps>, key?: string) => void
  onPatch: (patch: Partial<FormField>, key?: string) => void
}) {
  const p = field.props ?? {}
  const id = (s: string) => `insp-${field.id}-${s}`
  switch (field.type) {
    case "number":
      return (
        <div className="grid grid-cols-3 gap-2">
          <Row label="Prefix" htmlFor={id("pre")}>
            <Input id={id("pre")} className="h-8" value={p.prefix ?? ""} onChange={(e) => setProps({ prefix: e.target.value }, "pre")} />
          </Row>
          <Row label="Suffix" htmlFor={id("suf")}>
            <Input id={id("suf")} className="h-8" value={p.suffix ?? ""} onChange={(e) => setProps({ suffix: e.target.value }, "suf")} />
          </Row>
          <Row label="Step" htmlFor={id("step")}>
            <NumberInput id={id("step")} value={p.step} min={0} onChange={(step) => setProps({ step }, "step")} />
          </Row>
        </div>
      )
    case "phone":
      return (
        <div className="space-y-4">
          <SwitchRow
            id={id("cc")}
            label="Country code picker"
            description="Respondents choose a country; numbers are stored as +91 98765 43210 and checked against that country's numbering plan."
            checked={!!p.countryCode}
            onChange={(countryCode) => setProps({ countryCode, defaultCountry: p.defaultCountry || "IN" })}
          />
          {p.countryCode && (
            <Row label="Default country" htmlFor={id("dc")}>
              <CountrySelect id={id("dc")} value={p.defaultCountry || "IN"} onChange={(defaultCountry) => setProps({ defaultCountry })} />
            </Row>
          )}
        </div>
      )
    case "full_name":
      return (
        <div className="space-y-3">
          <SwitchRow id={id("ttl")} label="Title" description="Mr, Ms, Dr…" checked={!!p.showTitle} onChange={(showTitle) => setProps({ showTitle })} />
          <SwitchRow id={id("mid")} label="Middle name" checked={!!p.showMiddle} onChange={(showMiddle) => setProps({ showMiddle })} />
        </div>
      )
    case "address":
      return (
        <div className="space-y-4">
          <SwitchRow id={id("l2")} label="Second address line" checked={p.showLine2 !== false} onChange={(showLine2) => setProps({ showLine2 })} />
          <SwitchRow id={id("st")} label="State / region" checked={p.showState !== false} onChange={(showState) => setProps({ showState })} />
          <Row label="Default country" htmlFor={id("dc")} description="Postal codes are validated for India, the US and the UK.">
            <CountrySelect id={id("dc")} value={p.defaultCountry ?? ""} allowNone onChange={(defaultCountry) => setProps({ defaultCountry })} />
          </Row>
        </div>
      )
    case "country":
      return (
        <Row label="Pre-selected country" htmlFor={id("dc")}>
          <CountrySelect
            id={id("dc")}
            value={typeof field.defaultValue === "string" ? field.defaultValue : ""}
            allowNone
            onChange={(code) => onPatch({ defaultValue: code || undefined })}
          />
        </Row>
      )
    case "currency":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Row label="Currency" htmlFor={id("cur")}>
            <Select value={p.currency || "INR"} onValueChange={(currency) => setProps({ currency, decimals: currency === "JPY" ? 0 : (p.decimals ?? 2) })}>
              <SelectTrigger id={id("cur")} size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="font-mono">{c.code}</span> {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Decimals" htmlFor={id("dec")}>
            <NumberInput id={id("dec")} value={p.decimals ?? 2} min={0} max={4} onChange={(decimals) => setProps({ decimals: Math.min(4, Math.max(0, decimals ?? 2)) }, "dec")} />
          </Row>
        </div>
      )
    case "slider":
      return (
        <div className="grid grid-cols-3 gap-2">
          <Row label="Min" htmlFor={id("smin")}>
            <NumberInput id={id("smin")} value={p.scaleMin ?? 0} onChange={(v) => setProps({ scaleMin: v ?? 0 }, "smin")} />
          </Row>
          <Row label="Max" htmlFor={id("smax")}>
            <NumberInput id={id("smax")} value={p.scaleMax ?? 100} onChange={(v) => setProps({ scaleMax: Math.max((p.scaleMin ?? 0) + 1, v ?? 100) }, "smax")} />
          </Row>
          <Row label="Step" htmlFor={id("sstep")}>
            <NumberInput id={id("sstep")} value={p.step ?? 1} min={0} onChange={(v) => setProps({ step: v && v > 0 ? v : 1 }, "sstep")} />
          </Row>
          <Row label="Prefix" htmlFor={id("pre")}>
            <Input id={id("pre")} className="h-8" value={p.prefix ?? ""} onChange={(e) => setProps({ prefix: e.target.value }, "pre")} />
          </Row>
          <Row label="Suffix" htmlFor={id("suf")}>
            <Input id={id("suf")} className="h-8" value={p.suffix ?? ""} placeholder="%" onChange={(e) => setProps({ suffix: e.target.value }, "suf")} />
          </Row>
          <div />
          <Row label="Low label" htmlFor={id("lmin")}>
            <Input id={id("lmin")} className="h-8" value={p.minLabel ?? ""} onChange={(e) => setProps({ minLabel: e.target.value }, "lmin")} />
          </Row>
          <Row label="High label" htmlFor={id("lmax")}>
            <Input id={id("lmax")} className="h-8" value={p.maxLabel ?? ""} onChange={(e) => setProps({ maxLabel: e.target.value }, "lmax")} />
          </Row>
        </div>
      )
    case "appointment": {
      const count = appointmentSlots(p).length
      return (
        <div className="space-y-4">
          <Separator />
          <SectionTitle>Availability</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            <Row label="From" htmlFor={id("as")}>
              <Input id={id("as")} type="time" className="h-8" value={p.slotStart ?? "09:00"} onChange={(e) => setProps({ slotStart: e.target.value }, "as")} />
            </Row>
            <Row label="Until" htmlFor={id("ae")}>
              <Input id={id("ae")} type="time" className="h-8" value={p.slotEnd ?? "17:00"} onChange={(e) => setProps({ slotEnd: e.target.value }, "ae")} />
            </Row>
            <Row label="Minutes" htmlFor={id("am")}>
              <NumberInput id={id("am")} value={p.slotMinutes ?? 30} min={5} max={240} onChange={(v) => setProps({ slotMinutes: Math.min(240, Math.max(5, v ?? 30)) }, "am")} />
            </Row>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground tabular-nums">{count} slot{count === 1 ? "" : "s"} per day</p>
          <Row label="Days" description="Weekdays respondents can book.">
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              value={(p.weekdays ?? [1, 2, 3, 4, 5]).map(String)}
              onValueChange={(v) => v.length && setProps({ weekdays: v.map(Number) })}
              className="flex-wrap"
            >
              {WEEKDAYS.map((d) => (
                <ToggleGroupItem key={d.v} value={String(d.v)} className="px-2 text-xs">
                  {d.l}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Row>
          <Row label="Booking window (days ahead)" htmlFor={id("ad")}>
            <NumberInput id={id("ad")} value={p.daysAhead ?? 30} min={1} max={180} onChange={(v) => setProps({ daysAhead: Math.min(180, Math.max(1, v ?? 30)) }, "ad")} />
          </Row>
          <SwitchRow
            id={id("ax")}
            label="One booking per slot"
            description="Booked slots are hidden from other respondents and double bookings are rejected on the server."
            checked={!!p.exclusiveSlots}
            onChange={(exclusiveSlots) => setProps({ exclusiveSlots })}
          />
        </div>
      )
    }
    case "video": {
      const ok = !!videoEmbedUrl(p.videoUrl)
      return (
        <Row label="Video URL" htmlFor={id("vid")} description="YouTube, Vimeo or Loom share link. YouTube uses the privacy-enhanced player.">
          <Input id={id("vid")} className="h-8" value={p.videoUrl ?? ""} placeholder="https://youtu.be/…" aria-invalid={!!p.videoUrl && !ok} onChange={(e) => setProps({ videoUrl: e.target.value }, "vid")} />
          {p.videoUrl && !ok && <FieldError>Paste a YouTube, Vimeo or Loom link.</FieldError>}
        </Row>
      )
    }
    case "long_text":
      return (
        <Row label="Rows" htmlFor={id("rows")}>
          <NumberInput id={id("rows")} value={p.rows ?? 4} min={2} max={20} onChange={(rows) => setProps({ rows }, "rows")} />
        </Row>
      )
    case "rating":
      return (
        <Row label="Number of stars" htmlFor={id("stars")}>
          <NumberInput id={id("stars")} value={p.maxRating ?? 5} min={3} max={10} onChange={(maxRating) => setProps({ maxRating: Math.min(10, Math.max(3, maxRating ?? 5)) }, "stars")} />
        </Row>
      )
    case "scale":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Row label="From" htmlFor={id("smin")}>
              <NumberInput id={id("smin")} value={p.scaleMin ?? 1} min={0} max={1} onChange={(v) => setProps({ scaleMin: Math.min(1, Math.max(0, v ?? 1)) }, "smin")} />
            </Row>
            <Row label="To" htmlFor={id("smax")}>
              <NumberInput id={id("smax")} value={p.scaleMax ?? 5} min={2} max={10} onChange={(v) => setProps({ scaleMax: Math.min(10, Math.max(2, v ?? 5)) }, "smax")} />
            </Row>
            <Row label="Low label" htmlFor={id("lmin")}>
              <Input id={id("lmin")} className="h-8" value={p.minLabel ?? ""} onChange={(e) => setProps({ minLabel: e.target.value }, "lmin")} />
            </Row>
            <Row label="High label" htmlFor={id("lmax")}>
              <Input id={id("lmax")} className="h-8" value={p.maxLabel ?? ""} onChange={(e) => setProps({ maxLabel: e.target.value }, "lmax")} />
            </Row>
          </div>
          <SwitchRow
            id={id("nps")}
            label="Treat as NPS"
            description="0–10 scale; analytics shows promoters, passives and detractors."
            checked={!!p.nps}
            onChange={(nps) => setProps(nps ? { nps, scaleMin: 0, scaleMax: 10 } : { nps })}
          />
        </div>
      )
    case "yes_no":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Row label="Yes label" htmlFor={id("yes")}>
            <Input id={id("yes")} className="h-8" value={p.yesLabel ?? "Yes"} onChange={(e) => setProps({ yesLabel: e.target.value }, "yes")} />
          </Row>
          <Row label="No label" htmlFor={id("no")}>
            <Input id={id("no")} className="h-8" value={p.noLabel ?? "No"} onChange={(e) => setProps({ noLabel: e.target.value }, "no")} />
          </Row>
        </div>
      )
    case "consent":
      return (
        <div className="space-y-4">
          <Row label="Agreement text" htmlFor={id("ct")}>
            <Textarea id={id("ct")} rows={3} value={p.consentText ?? ""} onChange={(e) => setProps({ consentText: e.target.value }, "ct")} />
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Link label" htmlFor={id("ll")}>
              <Input id={id("ll")} className="h-8" value={p.linkLabel ?? ""} placeholder="Terms" onChange={(e) => setProps({ linkLabel: e.target.value }, "ll")} />
            </Row>
            <Row label="Link URL" htmlFor={id("lu")}>
              <Input id={id("lu")} className="h-8" value={p.linkUrl ?? ""} placeholder="https://" onChange={(e) => setProps({ linkUrl: e.target.value }, "lu")} />
            </Row>
          </div>
        </div>
      )
    case "calculated":
      return <FormulaEditor field={field} setProps={setProps} otherKeys={otherKeys} />
    case "hidden":
      return (
        <div className="space-y-4">
          <Row label="URL parameter" htmlFor={id("param")} description={`Reads ?${p.paramName || field.key}=value from the form URL.`}>
            <Input
              id={id("param")}
              className="h-8 font-mono text-xs"
              value={p.paramName ?? ""}
              placeholder={field.key}
              onChange={(e) => setProps({ paramName: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") }, "param")}
            />
          </Row>
          <Row label="Fallback value" htmlFor={id("dv")}>
            <Input
              id={id("dv")}
              className="h-8"
              value={typeof field.defaultValue === "string" ? field.defaultValue : ""}
              onChange={(e) => onPatch({ defaultValue: e.target.value }, "dv")}
            />
          </Row>
        </div>
      )
    case "matrix":
      return (
        <div className="space-y-5">
          <Separator />
          <ItemsEditor
            title="Rows (statements)"
            items={p.matrixRows ?? []}
            onChange={(matrixRows) => setProps({ matrixRows }, "mrows")}
            prefix="r"
          />
          <ItemsEditor
            title="Columns (scale)"
            items={p.matrixColumns ?? []}
            onChange={(matrixColumns) => setProps({ matrixColumns }, "mcols")}
            prefix="c"
          />
        </div>
      )
    default:
      return null
  }
}

function FormulaEditor({ field, setProps, otherKeys }: { field: FormField; setProps: (patch: Partial<FieldProps>, key?: string) => void; otherKeys: Set<string> }) {
  const p = field.props ?? {}
  const keys = [...otherKeys].filter((k) => k !== field.key)
  const error = formulaError(p.formula ?? "", [...keys, "score"])
  const insert = (token: string) => setProps({ formula: `${(p.formula ?? "").replace(/^0$/, "")}${(p.formula ?? "").trim() && p.formula !== "0" ? " " : ""}${token}` }, "formula")
  return (
    <div className="space-y-4">
      <Row label="Formula" htmlFor={`formula-${field.id}`} description="Recomputed on the server for every submission — respondents can’t tamper with it.">
        <Textarea
          id={`formula-${field.id}`}
          rows={3}
          spellCheck={false}
          className="font-mono text-xs"
          value={p.formula ?? ""}
          placeholder="{{quantity}} * {{unit_price}}"
          aria-invalid={!!error}
          onChange={(e) => setProps({ formula: e.target.value }, "formula")}
        />
        {error ? <FieldError>{error}</FieldError> : <p className="text-xs text-emerald-600 dark:text-emerald-400">Formula is valid</p>}
      </Row>
      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">Insert answer</div>
        <div className="flex flex-wrap gap-1">
          {[...keys, "score"].slice(0, 30).map((k) => (
            <button key={k} type="button" onClick={() => insert(`{{${k}}}`)} className="rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted">
              {k}
            </button>
          ))}
        </div>
        <div className="pt-1 text-xs text-muted-foreground">Functions</div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(FORMULA_FUNCTIONS).map(([name, f]) => (
            <button key={name} type="button" title={`${name}(${f.args}) — ${f.description}`} onClick={() => insert(`${name}(`)} className="rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted">
              {name}()
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Row label="Decimals" htmlFor={`dec-${field.id}`}>
          <NumberInput id={`dec-${field.id}`} value={p.decimals ?? 2} min={0} max={6} onChange={(v) => setProps({ decimals: Math.max(0, Math.min(6, Math.trunc(v ?? 0))) })} />
        </Row>
        <Row label="Prefix" htmlFor={`pre-${field.id}`}>
          <Input id={`pre-${field.id}`} className="h-8" value={p.prefix ?? ""} placeholder="$" maxLength={6} onChange={(e) => setProps({ prefix: e.target.value }, "prefix")} />
        </Row>
        <Row label="Suffix" htmlFor={`suf-${field.id}`}>
          <Input id={`suf-${field.id}`} className="h-8" value={p.suffix ?? ""} placeholder="USD" maxLength={8} onChange={(e) => setProps({ suffix: e.target.value }, "suffix")} />
        </Row>
      </div>
    </div>
  )
}

function ImageProps({ field, setProps }: { field: FormField; setProps: (patch: Partial<FieldProps>, key?: string) => void }) {
  const p = field.props ?? {}
  const id = `insp-${field.id}`
  return (
    <div className="space-y-4">
      <Row label="Image URL" htmlFor={`${id}-img`}>
        <div className="flex gap-2">
          <Input
            id={`${id}-img`}
            className="h-8"
            value={p.imageUrl?.startsWith("data:") ? "(uploaded image)" : (p.imageUrl ?? "")}
            placeholder="https://…"
            onChange={(e) => setProps({ imageUrl: e.target.value }, "img")}
          />
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <UploadIcon />
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (!file) return
                  try {
                    setProps({ imageUrl: await readImage(file, 800) })
                  } catch (err) {
                    toast.error((err as Error).message)
                  }
                }}
              />
            </label>
          </Button>
        </div>
      </Row>
      <Row label="Alt text" htmlFor={`${id}-alt`}>
        <Input id={`${id}-alt`} className="h-8" value={p.alt ?? ""} onChange={(e) => setProps({ alt: e.target.value }, "alt")} />
      </Row>
    </div>
  )
}

function OptionsEditor({
  field,
  mode,
  onChange,
}: {
  field: FormField
  mode: FormMode
  onChange: (options: FieldOption[]) => void
}) {
  const options = field.options ?? []
  const scorable = FIELD_DEFINITIONS[field.type].scorable && mode === "QUIZ"
  const withImage = field.type === "image_choice"

  const withValues = (list: FieldOption[]) => {
    const taken = new Set<string>()
    return list.map((o) => {
      const base = slugifyKey(o.label)
      let value = base
      for (let n = 2; taken.has(value); n++) value = `${base}_${n}`
      taken.add(value)
      return { ...o, value }
    })
  }
  const update = (idx: number, patch: Partial<FieldOption>) =>
    onChange(withValues(options.map((o, i) => (i === idx ? { ...o, ...patch } : o))))
  const move = (idx: number, d: number) => {
    const to = idx + d
    if (to < 0 || to >= options.length) return
    const next = [...options]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionTitle>Options</SectionTitle>
        {scorable && (
          <Badge variant="secondary" className="text-[10px]">
            points
          </Badge>
        )}
      </div>
      <div className="space-y-1.5">
        {options.map((o, i) => (
          <div key={o.id} className="space-y-1.5 rounded-md border p-1.5">
            <div className="flex items-center gap-1">
              <span className="w-5 shrink-0 text-center text-[11px] text-muted-foreground tabular-nums">
                {String.fromCharCode(65 + i)}
              </span>
              <Input
                className="h-7 text-sm"
                value={o.label}
                aria-label={`Option ${i + 1}`}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              {scorable && (
                <NumberInput
                  value={o.points ?? 0}
                  className="h-7 w-14 shrink-0 px-2 text-xs"
                  onChange={(points) => update(i, { points: points ?? 0 })}
                />
              )}
              <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                <ArrowUpIcon />
              </Button>
              <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => move(i, 1)} disabled={i === options.length - 1} aria-label="Move down">
                <ArrowDownIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 hover:text-destructive"
                onClick={() => onChange(options.filter((_, j) => j !== i))}
                disabled={options.length <= 1}
                aria-label="Remove option"
              >
                <XIcon />
              </Button>
            </div>
            {withImage && (
              <Input
                className="h-7 text-xs"
                placeholder="Image URL (https://…)"
                value={o.imageUrl ?? ""}
                onChange={(e) => update(i, { imageUrl: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() =>
          onChange(withValues([...options, { id: uid("o"), label: `Option ${options.length + 1}`, value: "" }]))
        }
      >
        <PlusIcon /> Add option
      </Button>
      <p className="text-xs text-muted-foreground">
        Stored values: {options.map((o) => o.value).join(", ") || "—"}
      </p>
    </div>
  )
}

function ItemsEditor({
  title,
  items,
  onChange,
  prefix,
}: {
  title: string
  items: MatrixItem[]
  onChange: (items: MatrixItem[]) => void
  prefix: string
}) {
  return (
    <div className="space-y-2">
      <SectionTitle>{title}</SectionTitle>
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-1">
          <Input
            className="h-7 text-sm"
            value={it.label}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 hover:text-destructive"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            disabled={items.length <= 1}
            aria-label="Remove"
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onChange([...items, { id: uid(prefix), label: `Item ${items.length + 1}` }])}
      >
        <PlusIcon /> Add
      </Button>
    </div>
  )
}
