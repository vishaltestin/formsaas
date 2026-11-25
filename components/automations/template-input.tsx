"use client"

import { useRef, useState } from "react"
import { BracesIcon } from "lucide-react"

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupTextarea } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { VariableGroup } from "@/lib/automations/variables"

export function VariablePicker({ groups, onPick, align = "end" }: { groups: VariableGroup[]; onPick: (token: string) => void; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <InputGroupButton size="icon-xs" aria-label="Insert variable">
              <BracesIcon />
            </InputGroupButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Insert variable</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80 p-0" align={align}>
        <Command>
          <CommandInput placeholder="Search variables…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No variables.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.group} heading={g.group}>
                {g.items.map((it) => (
                  <CommandItem
                    key={it.path}
                    value={`${it.path} ${it.label}`}
                    onSelect={() => {
                      onPick(`{{${it.path}}}`)
                      setOpen(false)
                    }}
                  >
                    <span className="truncate">{it.label}</span>
                    <span className="ml-auto max-w-[55%] truncate font-mono text-[10px] text-muted-foreground">{it.path}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Text input / textarea with a variable picker that inserts `{{tokens}}` at the caret. */
export function TemplateInput({
  id,
  value,
  onChange,
  groups,
  multiline = false,
  rows = 4,
  placeholder,
  mono = false,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  groups: VariableGroup[]
  multiline?: boolean
  rows?: number
  placeholder?: string
  mono?: boolean
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const insert = (token: string) => {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = value.slice(0, start) + token + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }
  return (
    <InputGroup>
      {multiline ? (
        <InputGroupTextarea
          id={id}
          ref={ref as React.Ref<HTMLTextAreaElement>}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={mono ? "font-mono text-xs" : "text-sm"}
        />
      ) : (
        <InputGroupInput
          id={id}
          ref={ref as React.Ref<HTMLInputElement>}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={mono ? "font-mono text-xs" : undefined}
        />
      )}
      <InputGroupAddon align={multiline ? "block-end" : "inline-end"} className={multiline ? "justify-end" : undefined}>
        <VariablePicker groups={groups} onPick={insert} />
      </InputGroupAddon>
    </InputGroup>
  )
}
