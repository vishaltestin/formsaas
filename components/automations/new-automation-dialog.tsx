"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { createAutomation } from "@/app/actions/automations"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates"

export function NewAutomationDialog({
  formId,
  open,
  onOpenChange,
  onCreated,
}: {
  formId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState("New automation")
  const [template, setTemplate] = useState("lead-routing")
  const [pending, startTransition] = useTransition()

  const create = () =>
    startTransition(async () => {
      const res = await createAutomation(formId, { name, template })
      if (!res.ok) return void toast.error(res.error)
      toast.success("Automation created")
      onOpenChange(false)
      onCreated(res.data.id)
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New automation</DialogTitle>
          <DialogDescription>Start from a template — everything is editable on the canvas. New automations start paused.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="na-name">Name</FieldLabel>
            <Input id="na-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <RadioGroup value={template} onValueChange={setTemplate} className="gap-2">
            {AUTOMATION_TEMPLATES.map((t) => (
              <label key={t.id} htmlFor={`tpl-${t.id}`} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-data-[state=checked]:border-foreground/50 has-data-[state=checked]:bg-muted/40">
                <RadioGroupItem id={`tpl-${t.id}`} value={t.id} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={pending || !name.trim()}>
            {pending && <Spinner data-icon="inline-start" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
