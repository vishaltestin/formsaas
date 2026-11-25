"use client"

import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from "lucide-react"

import {
  COUNTRIES,
  countryByCode,
  PRIORITY_COUNTRIES,
  type FieldValue,
  type FormField,
} from "@/lib/form-engine"
import { cn } from "@/lib/utils"

export interface ExtraControlProps {
  field: FormField
  value: FieldValue
  onChange: (v: FieldValue) => void
  onBlur?: () => void
  invalid?: boolean
  disabled: boolean
  id: string
  autoFocus?: boolean
  /** /api/public/forms/:slug/slots — omitted in previews */
  slotsEndpoint?: string
}

type Rec = Record<string, string>
const asRecord = (v: FieldValue): Rec =>
  v && typeof v === "object" && !Array.isArray(v) && !("dataUrl" in v) ? (v as Rec) : {}

function SubLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="fs-muted mt-1 block text-[0.78em]">
      {children}
    </label>
  )
}

export function CountryOptions() {
  const priority = PRIORITY_COUNTRIES.map((c) => countryByCode(c)).filter(Boolean) as (typeof COUNTRIES)[number][]
  return (
    <>
      <optgroup label="Common">
        {priority.map(([code, name]) => (
          <option key={`p-${code}`} value={code}>
            {name}
          </option>
        ))}
      </optgroup>
      <optgroup label="All countries">
        {COUNTRIES.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </optgroup>
    </>
  )
}

/* ───────────── Full name ───────────── */

const TITLES = ["Mr", "Ms", "Mrs", "Mx", "Dr", "Prof"]

export function FullNameControl({ field, value, onChange, onBlur, invalid, disabled, id, autoFocus }: ExtraControlProps) {
  const v = asRecord(value)
  const set = (k: string, x: string) => onChange({ ...v, [k]: x })
  const showTitle = !!field.props?.showTitle
  const showMiddle = !!field.props?.showMiddle
  const cols = 2 + (showTitle ? 1 : 0) + (showMiddle ? 1 : 0)
  return (
    <div className={cn("grid gap-2", cols === 2 ? "@sm:grid-cols-2" : cols === 3 ? "@sm:grid-cols-3" : "@sm:grid-cols-[6rem_1fr_1fr_1fr]")}>
      {showTitle && (
        <div>
          <select id={`${id}-title`} className="fs-input" disabled={disabled} value={v.title ?? ""} onChange={(e) => set("title", e.target.value)} onBlur={onBlur}>
            <option value="">—</option>
            {TITLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <SubLabel htmlFor={`${id}-title`}>Title</SubLabel>
        </div>
      )}
      <div>
        <input id={id} className="fs-input" autoComplete="given-name" autoFocus={autoFocus} aria-invalid={(invalid && !v.first?.trim()) || undefined} disabled={disabled} value={v.first ?? ""} onChange={(e) => set("first", e.target.value)} onBlur={onBlur} />
        <SubLabel htmlFor={id}>First name</SubLabel>
      </div>
      {showMiddle && (
        <div>
          <input id={`${id}-middle`} className="fs-input" autoComplete="additional-name" disabled={disabled} value={v.middle ?? ""} onChange={(e) => set("middle", e.target.value)} onBlur={onBlur} />
          <SubLabel htmlFor={`${id}-middle`}>Middle name</SubLabel>
        </div>
      )}
      <div>
        <input id={`${id}-last`} className="fs-input" autoComplete="family-name" aria-invalid={(invalid && !v.last?.trim()) || undefined} disabled={disabled} value={v.last ?? ""} onChange={(e) => set("last", e.target.value)} onBlur={onBlur} />
        <SubLabel htmlFor={`${id}-last`}>Last name</SubLabel>
      </div>
    </div>
  )
}

/* ───────────── Address ───────────── */

export function AddressControl({ field, value, onChange, onBlur, invalid, disabled, id, autoFocus }: ExtraControlProps) {
  const v = asRecord(value)
  const country = v.country || field.props?.defaultCountry || ""
  const set = (k: string, x: string) => onChange({ ...v, country, [k]: x })
  const postalLabel = country === "IN" ? "PIN code" : country === "US" ? "ZIP code" : "Postal code"
  const stateLabel = country === "US" || country === "IN" || country === "AU" ? "State" : "State / region"
  return (
    <div className="grid gap-2 @sm:grid-cols-2">
      <div className="@sm:col-span-2">
        <input id={id} className="fs-input" autoComplete="address-line1" autoFocus={autoFocus} aria-invalid={(invalid && !v.line1?.trim()) || undefined} disabled={disabled} value={v.line1 ?? ""} onChange={(e) => set("line1", e.target.value)} onBlur={onBlur} />
        <SubLabel htmlFor={id}>Street address</SubLabel>
      </div>
      {field.props?.showLine2 !== false && (
        <div className="@sm:col-span-2">
          <input id={`${id}-line2`} className="fs-input" autoComplete="address-line2" disabled={disabled} value={v.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} onBlur={onBlur} />
          <SubLabel htmlFor={`${id}-line2`}>Apartment, suite, floor (optional)</SubLabel>
        </div>
      )}
      <div>
        <input id={`${id}-city`} className="fs-input" autoComplete="address-level2" aria-invalid={(invalid && !v.city?.trim()) || undefined} disabled={disabled} value={v.city ?? ""} onChange={(e) => set("city", e.target.value)} onBlur={onBlur} />
        <SubLabel htmlFor={`${id}-city`}>City</SubLabel>
      </div>
      {field.props?.showState !== false && (
        <div>
          <input id={`${id}-state`} className="fs-input" autoComplete="address-level1" disabled={disabled} value={v.state ?? ""} onChange={(e) => set("state", e.target.value)} onBlur={onBlur} />
          <SubLabel htmlFor={`${id}-state`}>{stateLabel}</SubLabel>
        </div>
      )}
      <div>
        <input id={`${id}-postal`} className="fs-input tabular-nums" autoComplete="postal-code" aria-invalid={(invalid && !v.postal?.trim()) || undefined} disabled={disabled} value={v.postal ?? ""} onChange={(e) => set("postal", e.target.value)} onBlur={onBlur} />
        <SubLabel htmlFor={`${id}-postal`}>{postalLabel}</SubLabel>
      </div>
      <div>
        <select id={`${id}-country`} className="fs-input" autoComplete="country" disabled={disabled} value={country} onChange={(e) => set("country", e.target.value)} onBlur={onBlur}>
          <option value="">Select a country</option>
          <CountryOptions />
        </select>
        <SubLabel htmlFor={`${id}-country`}>Country</SubLabel>
      </div>
    </div>
  )
}

/* ───────────── Country ───────────── */

export function CountryControl({ field, value, onChange, onBlur, invalid, disabled, id, autoFocus }: ExtraControlProps) {
  return (
    <select id={id} className="fs-input" autoComplete="country" autoFocus={autoFocus} aria-invalid={invalid || undefined} disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}>
      <option value="">{field.placeholder || "Select a country"}</option>
      <CountryOptions />
    </select>
  )
}

/* ───────────── Ranking ───────────── */

export function RankingControl({ field, value, onChange, onBlur, invalid, disabled }: ExtraControlProps) {
  const options = field.options ?? []
  const current = Array.isArray(value) ? (value as string[]) : []
  const complete = current.length === options.length && options.every((o) => current.includes(o.value))
  const order = complete ? current : options.map((o) => o.value)
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
    onBlur?.()
  }
  return (
    <div className="grid gap-1.5" role="list" data-invalid={invalid || undefined}>
      {order.map((v, i) => (
        <div key={v} role="listitem" className="fs-choice cursor-default! py-2!" data-checked={complete}>
          <GripVerticalIcon className="fs-muted size-4 shrink-0" aria-hidden />
          <span className="fs-key tabular-nums">{i + 1}</span>
          <span className="flex-1">{labelOf(v)}</span>
          <span className="flex gap-0.5">
            <button type="button" disabled={disabled || i === 0} aria-label={`Move ${labelOf(v)} up`} className="fs-muted grid size-7 place-items-center rounded disabled:opacity-30" onClick={() => move(i, -1)}>
              <ArrowUpIcon className="size-4" />
            </button>
            <button type="button" disabled={disabled || i === order.length - 1} aria-label={`Move ${labelOf(v)} down`} className="fs-muted grid size-7 place-items-center rounded disabled:opacity-30" onClick={() => move(i, 1)}>
              <ArrowDownIcon className="size-4" />
            </button>
          </span>
        </div>
      ))}
      {!complete && !disabled && (
        <button type="button" className="fs-link mt-1 justify-self-start text-sm" onClick={() => { onChange(order); onBlur?.() }}>
          Keep this order
        </button>
      )}
    </div>
  )
}

