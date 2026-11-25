"use client"

import { useId } from "react"
import { CheckIcon, FileIcon, ImageIcon, PlusIcon, StarIcon, UploadIcon, XIcon } from "lucide-react"

import { AddressControl, CountryControl, FullNameControl, RankingControl } from "@/components/renderer/field-control-extra"
import {
  AppointmentControl,
  ColorControl,
  CurrencyControl,
  DateControl,
  DateRangeControl,
  DateTimeControl,
  PhoneControl,
  SliderControl,
} from "@/components/renderer/field-control-pickers"
import { SignaturePad } from "@/components/renderer/signature-pad"
import {
  isFileValue,
  type FieldValue,
  type FileValue,
  type FormField,
} from "@/lib/form-engine"
import { cn } from "@/lib/utils"

export interface FieldControlProps {
  field: FormField
  value: FieldValue
  onChange: (v: FieldValue) => void
  onBlur?: () => void
  invalid?: boolean
  /** design = rendered on the builder canvas (non-interactive control) */
  design?: boolean
  /** shows A/B/C keyboard hints (card mode) */
  showKeys?: boolean
  autoFocus?: boolean
  inputId?: string
  maxUploadMb?: number
  /** Booked-slot lookup for appointment fields (public renderer only) */
  slotsEndpoint?: string
}

const letter = (i: number) => String.fromCharCode(65 + i)

function readFile(file: File, maxMb: number): Promise<FileValue> {
  return new Promise((resolve) => {
    if (file.size > maxMb * 1024 * 1024) {
      resolve({ name: file.name, size: file.size, type: file.type || "application/octet-stream", dataUrl: "" })
      return
    }
    const reader = new FileReader()
    reader.onload = () =>
      resolve({ name: file.name, size: file.size, type: file.type || "application/octet-stream", dataUrl: String(reader.result) })
    reader.onerror = () => resolve({ name: file.name, size: file.size, type: file.type, dataUrl: "" })
    reader.readAsDataURL(file)
  })
}

export function FieldControl({
  field,
  value,
  onChange,
  onBlur,
  invalid,
  design,
  showKeys,
  autoFocus,
  inputId,
  maxUploadMb,
  slotsEndpoint,
}: FieldControlProps) {
  const autoId = useId()
  const id = inputId ?? autoId
  const disabled = !!design
  const common = {
    id,
    onBlur,
    disabled,
    "aria-invalid": invalid || undefined,
    autoFocus,
    className: "fs-input",
  }
  const str = typeof value === "string" || typeof value === "number" ? String(value) : ""
  const arr = Array.isArray(value) ? (value as string[]) : []
  const options = field.options ?? []
  const v = field.validation ?? {}

  const extra = { field, value, onChange, onBlur, invalid, disabled, id, autoFocus, slotsEndpoint }

  switch (field.type) {
    case "full_name":
      return <FullNameControl {...extra} />
    case "address":
      return <AddressControl {...extra} />
    case "country":
      return <CountryControl {...extra} />
    case "currency":
      return <CurrencyControl {...extra} />
    case "color":
      return <ColorControl {...extra} />
    case "slider":
      return <SliderControl {...extra} />
    case "ranking":
      return <RankingControl {...extra} />
    case "datetime":
      return <DateTimeControl {...extra} />
    case "date_range":
      return <DateRangeControl {...extra} />
    case "appointment":
      return <AppointmentControl {...extra} />
    case "phone":
      if (field.props?.countryCode) return <PhoneControl {...extra} />
    // falls through
    case "short_text":
    case "email":
    case "url":
    case "password": {
      const type =
        field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "url" ? "url" : field.type === "password" ? "password" : "text"
      return (
        <input
          {...common}
          type={type}
          value={str}
          placeholder={field.placeholder}
          maxLength={v.maxLength}
          autoComplete={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "password" ? "new-password" : "on"}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }
    case "number":
      return (
        <div className="flex items-center gap-2">
          {field.props?.prefix && <span className="fs-muted">{field.props.prefix}</span>}
          <input
            {...common}
            type="number"
            inputMode="decimal"
            value={str}
            min={v.min}
            max={v.max}
            step={field.props?.step ?? "any"}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.props?.suffix && <span className="fs-muted">{field.props.suffix}</span>}
        </div>
      )
    case "calculated": {
      const n = Number(value)
      const d = field.props?.decimals ?? 2
      const shown = value === undefined || value === null || value === "" || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
      return (
        <output id={inputId} aria-live="polite" className="fs-input flex items-center gap-1 tabular-nums" data-readonly="true" style={{ cursor: "default" }}>
          {field.props?.prefix && <span className="fs-muted">{field.props.prefix}</span>}
          <span className="font-medium">{shown}</span>
          {field.props?.suffix && <span className="fs-muted">{field.props.suffix}</span>}
        </output>
      )
    }
    case "long_text":
      return (
        <textarea
          {...common}
          rows={field.props?.rows ?? 4}
          value={str}
          placeholder={field.placeholder}
          maxLength={v.maxLength}
          onChange={(e) => onChange(e.target.value)}
          style={{ resize: "vertical" }}
        />
      )
    case "select":
      return (
        <select {...common} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.placeholder || "Select an option"}</option>
          {options.map((o) => (
            <option key={o.id} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case "radio":
    case "checkboxes": {
      const multi = field.type === "checkboxes"
      return (
        <div className="grid gap-2" role={multi ? "group" : "radiogroup"} aria-invalid={invalid || undefined}>
          {options.map((o, i) => {
            const checked = multi ? arr.includes(o.value) : str === o.value
            return (
              <button
                key={o.id}
                type="button"
                role={multi ? "checkbox" : "radio"}
                aria-checked={checked}
                data-checked={checked}
                disabled={disabled}
                className="fs-choice"
                onClick={() => {
                  if (multi) onChange(checked ? arr.filter((x) => x !== o.value) : [...arr, o.value])
                  else onChange(o.value)
                  onBlur?.()
                }}
              >
                {showKeys ? (
                  <span className="fs-key">{letter(i)}</span>
                ) : (
                  <span className="fs-indicator" data-shape={multi ? "square" : "circle"}>
                    {checked && (multi ? <CheckIcon className="size-3" style={{ color: "var(--fs-primary-text)" }} /> : <span className="fs-indicator-dot" />)}
                  </span>
                )}
                <span className="flex-1">{o.label}</span>
              </button>
            )
          })}
        </div>
      )
    }
    case "multi_select":
      return (
        <div className="flex flex-wrap gap-2" role="group">
          {options.map((o, i) => {
            const checked = arr.includes(o.value)
            return (
              <button
                key={o.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                data-checked={checked}
                disabled={disabled}
                className="fs-choice w-auto! gap-1.5! rounded-full! px-3.5! py-1.5!"
                onClick={() => {
                  onChange(checked ? arr.filter((x) => x !== o.value) : [...arr, o.value])
                  onBlur?.()
                }}
              >
                {showKeys && <span className="fs-key">{letter(i)}</span>}
                {!showKeys && (checked ? <CheckIcon className="size-3.5" /> : <PlusIcon className="fs-muted size-3.5" />)}
                {o.label}
              </button>
            )
          })}
        </div>
      )
    case "image_choice":
      return (
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-3" role="radiogroup">
          {options.map((o, i) => {
            const checked = str === o.value
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={checked}
                data-checked={checked}
                disabled={disabled}
                onClick={() => {
                  onChange(o.value)
                  onBlur?.()
                }}
                className="fs-choice flex-col! items-stretch! gap-2! p-2!"
              >
                <div
                  className="relative aspect-[16/10] w-full overflow-hidden"
                  style={{ borderRadius: "calc(var(--fs-radius) - 2px)", background: "color-mix(in srgb, var(--fs-primary) 8%, var(--fs-surface))" }}
                >
                  {o.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.imageUrl} alt={o.label} className="h-full w-full object-cover" />
                  ) : (
                    <div className="fs-muted grid h-full place-items-center">
                      <ImageIcon className="size-6 opacity-60" />
                    </div>
                  )}
                  {checked && (
                    <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full" style={{ background: "var(--fs-primary)", color: "var(--fs-primary-text)" }}>
                      <CheckIcon className="size-3" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 px-1 pb-0.5 text-sm">
                  {showKeys && <span className="fs-key">{letter(i)}</span>}
                  {o.label}
                </div>
              </button>
            )
          })}
        </div>
      )
    case "yes_no": {
      const yes = value === true
      const no = value === false
      return (
        <div className="fs-segment" role="radiogroup">
          <button type="button" role="radio" aria-checked={yes} data-checked={yes} disabled={disabled} onClick={() => { onChange(true); onBlur?.() }}>
            {showKeys && <span className="fs-key mr-2">A</span>}
            {field.props?.yesLabel || "Yes"}
          </button>
          <button type="button" role="radio" aria-checked={no} data-checked={no} disabled={disabled} onClick={() => { onChange(false); onBlur?.() }}>
            {showKeys && <span className="fs-key mr-2">B</span>}
            {field.props?.noLabel || "No"}
          </button>
        </div>
      )
    }
    case "rating": {
      const max = field.props?.maxRating ?? 5
      const current = Number(value) || 0
      return (
        <div className="flex gap-1" role="radiogroup" aria-label={field.label}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={current === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className="fs-star"
              data-active={n <= current}
              disabled={disabled}
              onClick={() => {
                onChange(n)
                onBlur?.()
              }}
            >
              <StarIcon className="size-7" fill={n <= current ? "currentColor" : "none"} strokeWidth={1.5} />
            </button>
          ))}
        </div>
      )
    }
    case "scale": {
      const min = field.props?.scaleMin ?? 0
      const max = field.props?.scaleMax ?? 10
      const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i)
      return (
        <div>
          <div className="fs-scale" data-many={nums.length > 7 || undefined} style={{ ["--fs-scale-n" as string]: nums.length }} role="radiogroup">
            {nums.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={Number(value) === n && str !== ""}
                data-checked={str !== "" && Number(value) === n}
                disabled={disabled}
                onClick={() => {
                  onChange(n)
                  onBlur?.()
                }}
              >
                {n}
              </button>
            ))}
          </div>
          {(field.props?.minLabel || field.props?.maxLabel) && (
            <div className="fs-muted mt-2 flex justify-between text-xs">
              <span>{field.props?.minLabel}</span>
              <span>{field.props?.maxLabel}</span>
            </div>
          )}
        </div>
      )
    }
    case "matrix": {
      const rows = field.props?.matrixRows ?? []
      const cols = field.props?.matrixColumns ?? []
      const obj = value && typeof value === "object" && !Array.isArray(value) && !isFileValue(value) ? (value as Record<string, string>) : {}
      return (
        <div className="overflow-x-auto">
          <table className="fs-matrix">
            <thead>
              <tr>
                <th />
                {cols.map((c) => (
                  <th key={c.id} className="fs-muted font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  {cols.map((c) => {
                    const checked = obj[r.id] === c.id
                    return (
                      <td key={c.id}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          aria-label={`${r.label}: ${c.label}`}
                          disabled={disabled}
                          className="inline-grid place-items-center p-1"
                          onClick={() => {
                            onChange({ ...obj, [r.id]: c.id })
                            onBlur?.()
                          }}
                        >
                          <span className="fs-indicator" data-shape="circle" data-checked={checked}>
                            {checked && <span className="fs-indicator-dot" />}
                          </span>
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case "date":
      return <DateControl {...extra} />
    case "time":
      return <input {...common} type="time" value={str} onChange={(e) => onChange(e.target.value)} />
    case "file": {
      const file = isFileValue(value) ? value : null
      const maxMb = Math.min(v.maxFileMb ?? 10, maxUploadMb ?? v.maxFileMb ?? 10)
      return (
        <div>
          {file ? (
            <div className="fs-input flex items-center gap-3">
              <FileIcon className="fs-muted size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{file.name}</div>
                <div className="fs-muted text-xs">{(file.size / 1024).toFixed(0)} KB · {file.type || "file"}</div>
              </div>
              {!disabled && (
                <button type="button" className="fs-muted" aria-label="Remove file" onClick={() => onChange(null)}>
                  <XIcon className="size-4" />
                </button>
              )}
            </div>
          ) : (
            <label
              htmlFor={id}
              className={cn("fs-input flex cursor-pointer flex-col items-center justify-center gap-1 border-dashed py-6 text-center", disabled && "cursor-default")}
              aria-invalid={invalid || undefined}
            >
              <UploadIcon className="fs-muted size-5" />
              <span className="text-sm font-medium">Click to upload</span>
              <span className="fs-muted text-xs">
                {(v.accept ?? []).length ? (v.accept ?? []).join(", ") : "Any file"} · up to {maxMb} MB
              </span>
              <input
                id={id}
                type="file"
                className="sr-only"
                disabled={disabled}
                accept={(v.accept ?? []).join(",")}
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  onChange(await readFile(f, maxMb))
                  onBlur?.()
                }}
              />
            </label>
          )}
        </div>
      )
    }
    case "signature":
      return (
        <SignaturePad
          value={typeof value === "string" ? value : null}
          onChange={(x) => {
            onChange(x)
            onBlur?.()
          }}
          disabled={disabled}
          invalid={invalid}
        />
      )
    case "consent": {
      const checked = value === true
      return (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          data-checked={checked}
          disabled={disabled}
          className="fs-choice items-start!"
          onClick={() => {
            onChange(!checked)
            onBlur?.()
          }}
        >
          <span className="fs-indicator mt-0.5" data-shape="square" data-checked={checked}>
            {checked && <CheckIcon className="size-3" style={{ color: "var(--fs-primary-text)" }} />}
          </span>
          <span className="flex-1 text-sm">
            {field.props?.consentText || "I agree"}
            {field.props?.linkUrl && (
              <>
                {" "}
                <a
                  href={field.props.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="fs-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {field.props.linkLabel || "Read more"}
                </a>
              </>
            )}
          </span>
        </button>
      )
    }
    default:
      return null
  }
}
