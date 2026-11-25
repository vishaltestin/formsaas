"use client"

/**
 * Composite form controls built on established libraries instead of
 * hand-rolled widgets:
 *   phone      → react-phone-number-input (libphonenumber-js metadata, SVG flags)
 *   currency   → react-number-format (locale-aware grouping incl. Indian lakh)
 *   colour     → react-colorful inside a shadcn Popover
 *   slider     → shadcn Slider (Radix)
 *   dates      → shadcn Calendar (react-day-picker) + date-fns
 *
 * Popovers portal into the nearest `.fs-root`, and `.fs-ui` maps the
 * shadcn tokens onto the form theme, so every picker follows the form's
 * colours, radius and font — in the public renderer and the builder alike.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { addYears, format, isValid, parseISO, startOfMonth, subYears } from "date-fns"
import { CalendarIcon, CheckIcon, XIcon } from "lucide-react"
import { HexColorPicker } from "react-colorful"
import { NumericFormat } from "react-number-format"
import PhoneInput, { type Country } from "react-phone-number-input"
import flags from "react-phone-number-input/flags"
import { parsePhoneNumberFromString } from "libphonenumber-js"
import type { DateRange, Matcher } from "react-day-picker"
import "react-phone-number-input/style.css"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { appointmentDates, appointmentSlots, currencySymbol } from "@/lib/form-engine"
import type { ExtraControlProps } from "@/components/renderer/field-control-extra"
import { cn } from "@/lib/utils"

type Rec = Record<string, string>
const asRecord = (v: ExtraControlProps["value"]): Rec =>
  v && typeof v === "object" && !Array.isArray(v) && !("dataUrl" in v) ? (v as Rec) : {}

/** Portal target: the closest themed form root (falls back to <body>). */
function useScopeContainer() {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    setContainer(el?.closest<HTMLElement>(".fs-root") ?? null)
  }, [])
  return [ref, container] as const
}

function localToday() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const ISO = "yyyy-MM-dd"
function toDate(s?: string | null) {
  if (!s) return undefined
  const d = parseISO(s)
  return isValid(d) ? d : undefined
}
const toIso = (d?: Date) => (d ? format(d, ISO) : "")
const pretty = (s?: string) => {
  const d = toDate(s)
  return d ? format(d, "EEE, d MMM yyyy") : ""
}
const short = (s?: string) => {
  const d = toDate(s)
  return d ? format(d, "d MMM yyyy") : ""
}

/** Calendar bounds from explicit min/max dates and date-of-birth age limits. */
function dateBounds(field: ExtraControlProps["field"], today: string) {
  const v = field.validation ?? {}
  const t = parseISO(today)
  const mins: Date[] = []
  const maxs: Date[] = []
  if (v.dateMin && toDate(v.dateMin)) mins.push(toDate(v.dateMin) as Date)
  if (v.dateMax && toDate(v.dateMax)) maxs.push(toDate(v.dateMax) as Date)
  if (typeof v.maxAge === "number") mins.push(subYears(t, v.maxAge + 1))
  if (typeof v.minAge === "number") maxs.push(subYears(t, v.minAge))
  const min = mins.length ? new Date(Math.max(...mins.map((d) => d.getTime()))) : undefined
  const max = maxs.length ? new Date(Math.min(...maxs.map((d) => d.getTime()))) : undefined
  const disabled: Matcher[] = []
  if (min) disabled.push({ before: min })
  if (max) disabled.push({ after: max })
  return {
    disabled,
    startMonth: startOfMonth(min ?? subYears(t, 100)),
    endMonth: startOfMonth(max ?? addYears(t, 10)),
  }
}

/* ───────────── Phone with country code ───────────── */

/** "+91 98765 43210" (stored) → "+919876543210" (E.164 for the library) */
function toE164(stored: string) {
  const s = stored.trim()
  if (!s.startsWith("+")) return undefined
  const digits = s.replace(/[^\d]/g, "")
  return digits ? `+${digits}` : undefined
}

/** E.164 → stored "+<dial> <national>" shape the server validators expect. */
function fromE164(e164?: string) {
  if (!e164) return ""
  const parsed = parsePhoneNumberFromString(e164)
  return parsed ? `+${parsed.countryCallingCode} ${parsed.nationalNumber}` : e164
}

const PRIORITY: Country[] = ["IN", "US", "GB", "AE", "SG", "AU", "CA", "DE"]

export function PhoneControl({ field, value, onChange, onBlur, invalid, disabled, id, autoFocus }: ExtraControlProps) {
  const def = (field.props?.defaultCountry || "IN") as Country
  const stored = typeof value === "string" ? value : ""
  return (
    <PhoneInput
      className="fs-input fs-phone"
      flags={flags}
      international
      withCountryCallingCode
      countryCallingCodeEditable={false}
      defaultCountry={def}
      addInternationalOption={false}
      countryOptionsOrder={[...PRIORITY.filter((c) => c !== def), "|", "..."]}
      disabled={disabled}
      value={toE164(stored)}
      onChange={(v) => onChange(fromE164(v))}
      countrySelectProps={{ "aria-label": "Country calling code" }}
      numberInputProps={{
        id,
        autoFocus,
        onBlur,
        autoComplete: "tel",
        "aria-invalid": invalid || undefined,
        placeholder: field.placeholder || undefined,
      }}
    />
  )
}

/* ───────────── Currency ───────────── */

export function CurrencyControl({ field, value, onChange, onBlur, invalid, disabled, id, autoFocus }: ExtraControlProps) {
  const code = field.props?.currency || "INR"
  const decimals = typeof field.props?.decimals === "number" ? field.props.decimals : 2
  const str = typeof value === "number" || typeof value === "string" ? String(value) : ""
  const min = field.validation?.min
  return (
    <div className="fs-input fs-affix" data-invalid={invalid || undefined}>
      <span className="fs-muted shrink-0 font-medium">{currencySymbol(code)}</span>
      <NumericFormat
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        placeholder={field.placeholder || (decimals ? `0.${"0".repeat(decimals)}` : "0")}
        value={str}
        valueIsNumericString
        thousandSeparator=","
        thousandsGroupStyle={code === "INR" ? "lakh" : "thousand"}
        decimalScale={decimals}
        allowNegative={typeof min === "number" && min < 0}
        onBlur={onBlur}
        onValueChange={(vals, info) => {
          if (info.source === "event") onChange(vals.value)
        }}
        className="fs-affix-input tabular-nums"
      />
      <span className="fs-muted shrink-0 text-[0.78em] font-medium tracking-wide">{code}</span>
    </div>
  )
}

/* ───────────── Colour ───────────── */

const SWATCHES = ["#1d4ed8", "#0f766e", "#15803d", "#ca8a04", "#ea580c", "#dc2626", "#7c3aed", "#0f172a"]

export function ColorControl({ value, onChange, onBlur, invalid, disabled, id, autoFocus }: ExtraControlProps) {
  const [scopeRef, container] = useScopeContainer()
  const text = typeof value === "string" ? value : ""
  const valid = /^#[0-9a-f]{6}$/i.test(text)
  const hex = valid ? text : "#1d4ed8"
  return (
    <div ref={scopeRef} className="flex max-w-xs items-stretch gap-2">
      <Popover onOpenChange={(open) => !open && onBlur?.()}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Open colour picker"
            className="fs-input w-12! shrink-0 p-1.5!"
            data-invalid={invalid || undefined}
          >
            <span
              className="block size-full rounded-[calc(var(--fs-radius)*0.6)] border"
              style={{ background: valid ? text : "repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 10px 10px" }}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent container={container} align="start" className="fs-ui w-auto gap-3 p-3">
          <HexColorPicker color={hex} onChange={onChange} className="fs-colorful" />
          <div className="grid grid-cols-8 gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c}`}
                className="grid size-6 place-items-center rounded-[calc(var(--fs-radius)*0.5)] border"
                style={{ background: c }}
                onClick={() => onChange(c)}
              >
                {c === text.toLowerCase() && <CheckIcon className="size-3.5 text-white" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <input
        id={id}
        className="fs-input min-w-0 flex-1 font-mono uppercase"
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={text}
        placeholder="#1D4ED8"
        maxLength={7}
        spellCheck={false}
        onBlur={onBlur}
        onChange={(e) => {
          const raw = e.target.value.trim()
          onChange(raw === "" ? "" : raw.startsWith("#") ? raw.toLowerCase() : `#${raw.toLowerCase()}`)
        }}
      />
    </div>
  )
}

/* ───────────── Slider ───────────── */

export function SliderControl({ field, value, onChange, onBlur, invalid, disabled, id }: ExtraControlProps) {
  const min = field.props?.scaleMin ?? 0
  const max = field.props?.scaleMax ?? 100
  const step = field.props?.step && field.props.step > 0 ? field.props.step : 1
  const has = value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value))
  const n = has ? Math.min(max, Math.max(min, Number(value))) : min
  const fmt = (x: number) => `${field.props?.prefix ?? ""}${x}${field.props?.suffix ?? ""}`
  return (
    <div className="fs-ui">
      <div className="mb-3 flex items-baseline justify-between gap-3 text-[0.85em]">
        <span className="fs-muted min-w-0 flex-1 truncate tabular-nums">{field.props?.minLabel || fmt(min)}</span>
        <output htmlFor={id} className={cn("fs-slider-value shrink-0 tabular-nums", !has && "fs-muted")} aria-live="polite">
          {has ? fmt(n) : "Drag to choose"}
        </output>
        <span className="fs-muted min-w-0 flex-1 truncate text-right tabular-nums">{field.props?.maxLabel || fmt(max)}</span>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[n]}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        data-empty={!has || undefined}
        className="fs-slider py-2"
        onValueChange={([x]) => onChange(x)}
        onValueCommit={() => onBlur?.()}
      />
    </div>
  )
}

/* ───────────── Date ───────────── */

function DateTrigger({
  id,
  disabled,
  invalid,
  autoFocus,
  text,
  placeholder,
  onClear,
  ...rest
}: {
  id?: string
  disabled: boolean
  invalid?: boolean
  autoFocus?: boolean
  text: string
  placeholder: string
  onClear?: () => void
} & React.ComponentProps<"button">) {
  return (
    <div className="relative">
      <button
        {...rest}
        id={id}
        type="button"
        disabled={disabled}
        autoFocus={autoFocus}
        data-invalid={invalid || undefined}
        className="fs-input flex items-center gap-2.5 pr-9! text-left"
      >
        <CalendarIcon className="fs-muted size-4 shrink-0" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate tabular-nums", !text && "fs-muted")}>{text || placeholder}</span>
      </button>
      {text && onClear && !disabled && (
        <button type="button" aria-label="Clear date" onClick={onClear} className="fs-muted absolute top-1/2 right-2.5 grid size-6 -translate-y-1/2 place-items-center rounded">
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function DateControl({ field, value, onChange, onBlur, invalid, disabled, id, autoFocus }: ExtraControlProps) {
  const [scopeRef, container] = useScopeContainer()
  const [open, setOpen] = useState(false)
  const [today, setToday] = useState("2026-01-01")
  const str = typeof value === "string" ? value : ""
  const selected = toDate(str)
  const bounds = useMemo(() => dateBounds(field, today), [field, today])
  return (
    <div ref={scopeRef}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) setToday(localToday())
          else onBlur?.()
          setOpen(o)
        }}
      >
        <PopoverTrigger asChild>
          <DateTrigger id={id} disabled={disabled} invalid={invalid} autoFocus={autoFocus} text={pretty(str)} placeholder={field.placeholder || "Select a date"} onClear={() => onChange("")} />
        </PopoverTrigger>
        <PopoverContent container={container} align="start" className="fs-ui w-auto p-0">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected ?? (bounds.endMonth < parseISO(today) ? bounds.endMonth : undefined)}
            startMonth={bounds.startMonth}
            endMonth={bounds.endMonth}
            disabled={bounds.disabled}
            className="[--cell-size:--spacing(9)]"
            onSelect={(d) => {
              onChange(toIso(d))
              if (d) setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

/* ───────────── Date range ───────────── */

export function DateRangeControl({ field, value, onChange, onBlur, invalid, disabled, id, autoFocus }: ExtraControlProps) {
  const [scopeRef, container] = useScopeContainer()
  const [open, setOpen] = useState(false)
  const [months, setMonths] = useState(1)
  const [today, setToday] = useState("2026-01-01")
  const r = asRecord(value)
  const range: DateRange | undefined = r.start ? { from: toDate(r.start), to: toDate(r.end) } : undefined
  const bounds = useMemo(() => dateBounds(field, today), [field, today])
  const nights = range?.from && range.to ? Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000) : 0
  const text = r.start ? `${short(r.start)} – ${r.end ? short(r.end) : "…"}` : ""
  return (
    <div ref={scopeRef}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) {
            setToday(localToday())
            setMonths(window.matchMedia("(min-width: 768px)").matches ? 2 : 1)
          } else onBlur?.()
          setOpen(o)
        }}
      >
        <PopoverTrigger asChild>
          <DateTrigger id={id} disabled={disabled} invalid={invalid} autoFocus={autoFocus} text={text} placeholder={field.placeholder || "Select start and end dates"} onClear={() => onChange({ start: "", end: "" })} />
        </PopoverTrigger>
        <PopoverContent container={container} align="start" className="fs-ui w-auto p-0">
          <Calendar
            mode="range"
            numberOfMonths={months}
            selected={range}
            defaultMonth={range?.from}
            startMonth={bounds.startMonth}
            endMonth={bounds.endMonth}
            disabled={bounds.disabled}
            className="[--cell-size:--spacing(9)]"
            onSelect={(next) => {
              onChange({ start: toIso(next?.from), end: toIso(next?.to) })
              if (next?.from && next.to && next.to.getTime() !== next.from.getTime()) setOpen(false)
            }}
          />
          <div className="fs-muted border-t px-3 py-2 text-xs">
            {range?.from && range.to ? `${nights + 1} day${nights ? "s" : ""} selected` : range?.from ? "Now pick the end date" : "Pick the start date"}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/* ───────────── Date & time ───────────── */

export function DateTimeControl({ field, value, onChange, onBlur, invalid, disabled, id, autoFocus }: ExtraControlProps) {
  const [scopeRef, container] = useScopeContainer()
  const [open, setOpen] = useState(false)
  const [today, setToday] = useState("2026-01-01")
  const str = typeof value === "string" ? value : ""
  const [datePart = "", timePart = ""] = str.split("T")
  const bounds = useMemo(() => dateBounds(field, today), [field, today])
  const emit = (d: string, t: string) => onChange(!d && !t ? "" : `${d}T${t.slice(0, 5)}`)
  return (
    <div ref={scopeRef} className="grid gap-2 @md:grid-cols-[minmax(0,1fr)_9.5rem]">
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) setToday(localToday())
          else onBlur?.()
          setOpen(o)
        }}
      >
        <PopoverTrigger asChild>
          <DateTrigger id={id} disabled={disabled} invalid={invalid && !datePart} autoFocus={autoFocus} text={pretty(datePart)} placeholder="Select a date" />
        </PopoverTrigger>
        <PopoverContent container={container} align="start" className="fs-ui w-auto p-0">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={toDate(datePart)}
            defaultMonth={toDate(datePart)}
            startMonth={bounds.startMonth}
            endMonth={bounds.endMonth}
            disabled={bounds.disabled}
            className="[--cell-size:--spacing(9)]"
            onSelect={(d) => {
              emit(toIso(d), timePart || (d ? "09:00" : ""))
              if (d) setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <div>
        <input
          type="time"
          aria-label="Time"
          className="fs-input tabular-nums"
          aria-invalid={(invalid && !timePart) || undefined}
          disabled={disabled}
          value={timePart.slice(0, 5)}
          onBlur={onBlur}
          onChange={(e) => emit(datePart, e.target.value)}
        />
      </div>
    </div>
  )
}

/* ───────────── Appointment ───────────── */

export function AppointmentControl({ field, value, onChange, onBlur, invalid, disabled, id, slotsEndpoint }: ExtraControlProps) {
  const r = asRecord(value)
  // Bookable days depend on "today": compute after mount so SSR and hydration match.
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setToday(localToday()), 0)
    return () => clearTimeout(t)
  }, [])
  const dates = useMemo(() => (today ? appointmentDates(field.props, today) : []), [field.props, today])
  const dateSet = useMemo(() => new Set(dates), [dates])
  const slots = useMemo(() => appointmentSlots(field.props), [field.props])
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const day = r.date || pickedDay || dates[0] || ""
  const [taken, setTaken] = useState<{ day: string; times: string[] }>({ day: "", times: [] })

  useEffect(() => {
    if (!slotsEndpoint || !field.props?.exclusiveSlots || !day) return
    let cancelled = false
    fetch(`${slotsEndpoint}?field=${encodeURIComponent(field.id)}&date=${day}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { taken: [] }))
      .then((data: { taken?: string[] }) => {
        if (!cancelled) setTaken({ day, times: data.taken ?? [] })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [slotsEndpoint, field.id, field.props?.exclusiveSlots, day])

  const takenTimes = taken.day === day ? taken.times : []
  if (slots.length === 0) return <p className="fs-muted text-sm">No time slots are configured for this field.</p>

  const first = toDate(dates[0])
  const last = toDate(dates[dates.length - 1])

  return (
    <div className="fs-ui grid gap-4 @xl:grid-cols-[auto_minmax(0,1fr)]" data-invalid={invalid || undefined}>
      <div id={id} className="fs-input w-full! p-1! @xl:w-auto!">
        <Calendar
          mode="single"
          required
          selected={toDate(day)}
          defaultMonth={toDate(day) ?? first}
          startMonth={first ? startOfMonth(first) : undefined}
          endMonth={last ? startOfMonth(last) : undefined}
          disabled={disabled ? true : (d) => !dateSet.has(format(d, ISO))}
          showOutsideDays={false}
          className="w-full bg-transparent [--cell-size:--spacing(9)]"
          classNames={{ root: "w-full @xl:w-fit" }}
          onSelect={(d) => {
            const iso = toIso(d)
            if (!iso) return
            setPickedDay(iso)
            if (r.time) onChange({ date: iso, time: "" })
          }}
        />
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-[0.9em] font-medium">{day ? pretty(day) : "Loading available days…"}</p>
        <div className="grid grid-cols-3 gap-1.5 @sm:grid-cols-4 @xl:grid-cols-3" role="radiogroup" aria-label="Time">
          {slots.map((t) => {
            const isTaken = takenTimes.includes(t)
            const checked = r.date === day && r.time === t
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={checked}
                data-checked={checked}
                disabled={disabled || isTaken || !day}
                title={isTaken ? "Already booked" : undefined}
                className={cn("fs-choice justify-center! gap-1.5! px-1! py-1.5! text-sm tabular-nums", isTaken && "line-through opacity-40")}
                onClick={() => {
                  onChange({ date: day, time: t })
                  onBlur?.()
                }}
              >
                {checked && <CheckIcon className="size-3.5" />}
                {t}
              </button>
            )
          })}
        </div>
        {r.date && r.time && (
          <p className="fs-muted mt-3 text-sm">
            Booked for <span style={{ color: "var(--fs-text)" }} className="font-medium tabular-nums">{pretty(r.date)} at {r.time}</span>
          </p>
        )}
      </div>
    </div>
  )
}
