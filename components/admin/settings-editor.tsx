"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { updateOwnerContact, updatePlan } from "@/app/actions/billing"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FEATURE_LABELS, formatLimit, type OwnerContact, type PlanFeatures, type PlanLimits } from "@/lib/plans"

export interface EditablePlan {
  id: string
  slug: string
  name: string
  description: string
  priceLabel: string
  isActive: boolean
  limits: PlanLimits
  features: PlanFeatures
  subscribers: number
}

function NumberLimit({ id, label, value, onChange, allowUnlimited = true, min = 0, hint }: { id: string; label: string; value: number; onChange: (n: number) => void; allowUnlimited?: boolean; min?: number; hint?: string }) {
  const unlimited = value < 0
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {allowUnlimited && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch checked={unlimited} onCheckedChange={(on) => onChange(on ? -1 : Math.max(min, 1))} className="scale-75" /> Unlimited
          </label>
        )}
      </div>
      <Input id={id} type="number" min={min} value={unlimited ? "" : value} placeholder={unlimited ? "Unlimited" : undefined} disabled={unlimited} onChange={(e) => onChange(Math.max(min, Math.floor(Number(e.target.value) || 0)))} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}

function PlanEditor({ plan }: { plan: EditablePlan }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState(plan)
  const dirty = JSON.stringify(draft) !== JSON.stringify(plan)
  const set = (patch: Partial<EditablePlan>) => setDraft((d) => ({ ...d, ...patch }))

  const save = () =>
    start(async () => {
      const res = await updatePlan({
        id: draft.id,
        name: draft.name,
        description: draft.description,
        priceLabel: draft.priceLabel,
        isActive: draft.isActive,
        limits: draft.limits,
        features: draft.features,
      })
      if (!res.ok) return void toast.error(res.error)
      toast.success(`${draft.name} saved`)
      router.refresh()
    })

  return (
    <div className="space-y-5 pt-1">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${plan.id}-name`}>Name</FieldLabel>
          <Input id={`${plan.id}-name`} value={draft.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${plan.id}-price`}>Price label</FieldLabel>
          <Input id={`${plan.id}-price`} value={draft.priceLabel} maxLength={30} onChange={(e) => set({ priceLabel: e.target.value })} placeholder="$29/mo" />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={`${plan.id}-desc`}>Description</FieldLabel>
          <Textarea id={`${plan.id}-desc`} rows={2} value={draft.description} maxLength={300} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberLimit id={`${plan.id}-forms`} label="Forms" value={draft.limits.maxForms} onChange={(maxForms) => set({ limits: { ...draft.limits, maxForms } })} />
        <NumberLimit id={`${plan.id}-subs`} label="Responses / month" value={draft.limits.monthlySubmissions} onChange={(monthlySubmissions) => set({ limits: { ...draft.limits, monthlySubmissions } })} />
        <NumberLimit id={`${plan.id}-mb`} label="Upload size (MB)" value={draft.limits.maxFileUploadMb} allowUnlimited={false} min={1} onChange={(maxFileUploadMb) => set({ limits: { ...draft.limits, maxFileUploadMb: Math.min(100, maxFileUploadMb) } })} hint="1–100 MB per file" />
      </div>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {(Object.keys(FEATURE_LABELS) as (keyof PlanFeatures)[]).map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 text-sm">
            {FEATURE_LABELS[k]}
            <Switch checked={draft.features[k]} onCheckedChange={(on) => set({ features: { ...draft.features, [k]: on } })} />
          </label>
        ))}
      </div>
      <Separator />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.isActive} disabled={plan.slug === "free"} onCheckedChange={(isActive) => set({ isActive })} />
          Available for upgrades
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty || pending} onClick={() => setDraft(plan)}>
            Reset
          </Button>
          <Button size="sm" disabled={!dirty || pending} onClick={save}>
            {pending && <Spinner />} Save plan
          </Button>
        </div>
      </div>
    </div>
  )
}

const contactSchema = z.object({
  ownerName: z.string().trim().min(1, "Name is required").max(80),
  ownerEmail: z.string().trim().email("Enter a valid email"),
  ownerPhone: z.string().trim().max(32).regex(/^[+0-9 ()-]*$/, "Invalid phone number"),
  ownerWhatsApp: z.string().trim().max(32).regex(/^\+?[0-9]*$/, "Digits only, optionally starting with +"),
  ownerBookingUrl: z.string().trim().url("Enter a valid URL").or(z.literal("")),
})

const CONTACT_FIELDS: { name: keyof OwnerContact; label: string; type: string; placeholder: string; hint?: string }[] = [
  { name: "ownerName", label: "Display name", type: "text", placeholder: "Digital Fueled Team" },
  { name: "ownerEmail", label: "Email", type: "email", placeholder: "sales@company.com", hint: "Upgrade request notifications are sent here." },
  { name: "ownerPhone", label: "Phone", type: "tel", placeholder: "+91 98765 43210" },
  { name: "ownerWhatsApp", label: "WhatsApp number", type: "tel", placeholder: "+919876543210", hint: "International format, digits only." },
  { name: "ownerBookingUrl", label: "Booking link", type: "url", placeholder: "https://cal.com/you", hint: "Calendly, Cal.com or similar." },
]

function ContactForm({ contact }: { contact: OwnerContact }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const form = useForm<OwnerContact>({ resolver: zodResolver(contactSchema), defaultValues: contact })
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await updateOwnerContact(values)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Contact details saved")
      form.reset(values)
      router.refresh()
    })
  )
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FieldGroup className="gap-4">
        {CONTACT_FIELDS.map((f) => (
          <Controller
            key={f.name}
            control={form.control}
            name={f.name}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`oc-${f.name}`}>{f.label}</FieldLabel>
                <Input id={`oc-${f.name}`} type={f.type} placeholder={f.placeholder} {...field} aria-invalid={fieldState.invalid} />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : f.hint && <FieldDescription>{f.hint}</FieldDescription>}
              </Field>
            )}
          />
        ))}
      </FieldGroup>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={!form.formState.isDirty || pending} onClick={() => form.reset(contact)}>
          Reset
        </Button>
        <Button type="submit" size="sm" disabled={!form.formState.isDirty || pending}>
          {pending && <Spinner />} Save contact
        </Button>
      </div>
    </form>
  )
}

export function SettingsEditor({ plans, contact }: { plans: EditablePlan[]; contact: OwnerContact }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-sm">Plans</CardTitle>
          <CardDescription className="text-xs">Limits and features are enforced server-side the moment you save.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <Accordion type="single" collapsible defaultValue={plans[1]?.id ?? plans[0]?.id}>
            {plans.map((p) => (
              <AccordionItem key={p.id} value={p.id}>
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex flex-1 items-center gap-2">
                    {p.name}
                    <span className="text-xs font-normal text-muted-foreground">
                      {p.priceLabel} · {formatLimit(p.limits.maxForms)} forms · {formatLimit(p.limits.monthlySubmissions)} responses
                    </span>
                    {!p.isActive && <Badge variant="outline">Hidden</Badge>}
                    <Badge variant="secondary" className="mr-2 ml-auto font-normal tabular-nums">
                      {p.subscribers} active
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <PlanEditor key={JSON.stringify(p)} plan={p} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
      <Card className="h-fit py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-sm">Owner contact</CardTitle>
          <CardDescription className="text-xs">Shown on every user’s billing page as contact buttons.</CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <ContactForm contact={contact} />
        </CardContent>
      </Card>
    </div>
  )
}
