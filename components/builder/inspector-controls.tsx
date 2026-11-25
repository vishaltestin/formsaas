"use client"

import { useState } from "react"
import { LockIcon } from "lucide-react"
import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export function Row({
  label,
  htmlFor,
  description,
  children,
  className,
}: {
  label: React.ReactNode
  htmlFor?: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Field className={cn("gap-1.5", className)}>
      <FieldLabel htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </FieldLabel>
      {children}
      {description && <FieldDescription className="text-xs">{description}</FieldDescription>}
    </Field>
  )
}

export function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <Field orientation="horizontal" className="items-start justify-between gap-3">
      <FieldContent className="gap-0.5">
        <FieldLabel htmlFor={id} className="text-xs font-medium">
          {label}
        </FieldLabel>
        {description && <FieldDescription className="text-xs">{description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </Field>
  )
}

/** Number input that maps "" ⇄ undefined and only commits valid numbers. */
export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  className,
}: {
  id?: string
  value: number | null | undefined
  onChange: (v: number | undefined) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  className?: string
}) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value))
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    // Sync from props during render (external changes such as undo/redo).
    setPrevValue(value)
    const current = text === "" ? undefined : Number(text)
    if (current !== value) setText(value === null || value === undefined ? "" : String(value))
  }
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className={cn("h-8", className)}
      onChange={(e) => {
        setText(e.target.value)
        if (e.target.value === "") return onChange(undefined)
        const n = Number(e.target.value)
        if (Number.isFinite(n)) onChange(n)
      }}
    />
  )
}

export function ColorInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    setPrevValue(value)
    setText(value)
  }
  return (
    <div className="flex items-center gap-2">
      <label
        className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border"
        style={{ background: value }}
        aria-label="Pick color"
      >
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <Input
        id={id}
        value={text}
        className="h-8 font-mono text-xs"
        onChange={(e) => {
          setText(e.target.value)
          if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase())
        }}
        onBlur={() => setText(value)}
      />
    </div>
  )
}

export function LockedNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Alert className="py-2.5">
      <LockIcon />
      <AlertTitle className="text-xs">{title}</AlertTitle>
      <AlertDescription className="text-xs">
        {children}{" "}
        <Link href="/dashboard/billing" className="font-medium text-foreground underline underline-offset-2">
          View plans
        </Link>
      </AlertDescription>
    </Alert>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{children}</div>
}

/** Reads an image file into a data URL with a size cap. */
export function readImage(file: File, maxKb: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file"))
    if (file.size > maxKb * 1024) return reject(new Error(`Image must be under ${maxKb} KB`))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Could not read file"))
    reader.readAsDataURL(file)
  })
}
