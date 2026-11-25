"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { CalendarClockIcon, CheckIcon, ClockIcon, MailIcon, MessageCircleIcon, MinusIcon, PhoneIcon, SparklesIcon } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { cancelUpgradeRequest, createUpgradeRequest } from "@/app/actions/billing"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, timeAgo } from "@/lib/format"
import { FEATURE_LABELS, formatLimit, type OwnerContact, type PlanFeatures, type PlanLimits } from "@/lib/plans"
import { cn } from "@/lib/utils"

export interface PlanCard {
  id: string
  slug: string
  name: string
  description: string | null
  priceLabel: string
  limits: PlanLimits
  features: PlanFeatures
}

export interface RequestRow {
  id: string
  planName: string
  status: "PENDING" | "APPROVED" | "DECLINED"
  createdAt: string
  updatedAt: string
  adminResponse: string | null
  message: string | null
}

const upgradeForm = z.object({
  planId: z.string().min(1),
  contactEmail: z.string().trim().email("Enter a valid email"),
  contactPhone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+0-9 ()-]*$/, "Use digits, spaces and + ( ) - only"),
  message: z.string().trim().max(1000, "Keep it under 1000 characters"),
})
type UpgradeValues = z.infer<typeof upgradeForm>

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max < 0 ? Math.min(100, used ? 8 : 0) : Math.min(100, (used / Math.max(1, max)) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {used.toLocaleString()} <span className="text-muted-foreground">/ {formatLimit(max)}</span>
        </span>
      </div>
      <Progress value={pct} className={cn(max >= 0 && pct >= 90 && "[&>div]:bg-destructive")} />
    </div>
  )
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

function whatsappHref(n: string, text: string) {
  return `https://wa.me/${n.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`
}

export function BillingView({
  current,
  plans,
  requests,
  owner,
  userEmail,
}: {
  current: {
    planId: string | null
    planSlug: string
    planName: string
    priceLabel: string
    status: "ACTIVE" | "EXPIRED" | "NONE"
    expiresAt: string | null
    usage: { forms: number; monthlySubmissions: number }
    limits: PlanLimits
  }
  plans: PlanCard[]
  requests: RequestRow[]
  owner: OwnerContact
  userEmail: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const pendingReq = requests.find((r) => r.status === "PENDING")
  const currentIndex = plans.findIndex((p) => p.id === current.planId || p.slug === current.planSlug)

  const form = useForm<UpgradeValues>({
    resolver: zodResolver(upgradeForm),
    defaultValues: { planId: "", contactEmail: userEmail, contactPhone: "", message: "" },
  })
  const watchedPlanId = useWatch({ control: form.control, name: "planId" })
  const selected = plans.find((p) => p.id === watchedPlanId)

  const openFor = (planId: string) => {
    form.reset({ planId, contactEmail: userEmail, contactPhone: "", message: "" })
    setOpen(true)
  }
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await createUpgradeRequest(values)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Request sent — we’ll reach out shortly")
      setOpen(false)
      router.refresh()
    })
  )
  const withdraw = (id: string) =>
    start(async () => {
      const res = await cancelUpgradeRequest(id)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Request withdrawn")
      router.refresh()
    })

  const expDays = current.expiresAt ? daysUntil(current.expiresAt) : null
  const contactText = `Hi ${owner.ownerName}, I'd like to talk about upgrading my Digital Fueled plan (${userEmail}).`

  return (
    <div className="space-y-6">
      {current.status === "EXPIRED" && (
        <Alert variant="destructive">
          <CalendarClockIcon />
          <AlertTitle>Your paid plan has expired</AlertTitle>
          <AlertDescription>You’re on Free limits until an admin renews your subscription. Request an upgrade below or contact us.</AlertDescription>
        </Alert>
      )}
      {current.status === "ACTIVE" && expDays !== null && expDays <= 14 && (
        <Alert>
          <CalendarClockIcon />
          <AlertTitle>{current.planName} renews soon</AlertTitle>
          <AlertDescription>Your plan expires on {formatDate(current.expiresAt!)} ({expDays} days). Contact us to extend it.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="py-5">
          <CardHeader className="px-5">
            <CardDescription>Current plan</CardDescription>
            <CardTitle className="flex items-center gap-2 text-xl">
              {current.planName}
              <Badge variant="secondary" className="font-normal">{current.priceLabel}</Badge>
            </CardTitle>
            <CardAction>
              {current.status === "ACTIVE" ? (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                  Active{current.expiresAt ? ` · until ${formatDate(current.expiresAt)}` : ""}
                </Badge>
              ) : (
                <Badge variant="outline">{current.status === "EXPIRED" ? "Expired" : "Free tier"}</Badge>
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4 px-5 sm:grid-cols-2">
            <Meter label="Forms" used={current.usage.forms} max={current.limits.maxForms} />
            <Meter label="Responses this month" used={current.usage.monthlySubmissions} max={current.limits.monthlySubmissions} />
          </CardContent>
        </Card>

        <Card className="gap-3 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-sm">Talk to {owner.ownerName}</CardTitle>
            <CardDescription className="text-xs">Plans are activated manually — reach out any time.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 px-5">
            {owner.ownerEmail && (
              <Button variant="outline" size="sm" className="justify-start" asChild>
                <a href={`mailto:${owner.ownerEmail}?subject=${encodeURIComponent("Digital Fueled upgrade")}&body=${encodeURIComponent(contactText)}`}>
                  <MailIcon /> {owner.ownerEmail}
                </a>
              </Button>
            )}
            {owner.ownerPhone && (
              <Button variant="outline" size="sm" className="justify-start" asChild>
                <a href={`tel:${owner.ownerPhone.replace(/[^+0-9]/g, "")}`}>
                  <PhoneIcon /> {owner.ownerPhone}
                </a>
              </Button>
            )}
            {owner.ownerWhatsApp && (
              <Button variant="outline" size="sm" className="justify-start" asChild>
                <a href={whatsappHref(owner.ownerWhatsApp, contactText)} target="_blank" rel="noreferrer">
                  <MessageCircleIcon /> WhatsApp
                </a>
              </Button>
            )}
            {owner.ownerBookingUrl && (
              <Button variant="outline" size="sm" className="justify-start" asChild>
                <a href={owner.ownerBookingUrl} target="_blank" rel="noreferrer">
                  <CalendarClockIcon /> Book a call
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {pendingReq && (
        <Alert>
          <ClockIcon />
          <AlertTitle>Upgrade to {pendingReq.planName} requested {timeAgo(pendingReq.createdAt)}</AlertTitle>
          <AlertDescription>
            <span>An admin will review it shortly. You can withdraw it if you change your mind.</span>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => withdraw(pendingReq.id)} disabled={pending}>
              Withdraw request
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h2 className="mb-3 text-sm font-medium">Plans</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p, i) => {
            const isCurrent = i === currentIndex
            const isUp = i > currentIndex
            return (
              <Card key={p.id} className={cn("py-5", isCurrent && "border-foreground/40")}>
                <CardHeader className="px-5">
                  <CardTitle className="flex items-center gap-2">
                    {p.name}
                    {isCurrent && <Badge variant="secondary">Current</Badge>}
                    {p.slug === "pro" && !isCurrent && <Badge variant="outline">Popular</Badge>}
                  </CardTitle>
                  <div className="text-2xl font-semibold tracking-tight">{p.priceLabel}</div>
                  <CardDescription className="text-xs">{p.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-2 px-5 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckIcon className="size-4 text-muted-foreground" /> {formatLimit(p.limits.maxForms)} forms
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIcon className="size-4 text-muted-foreground" /> {formatLimit(p.limits.monthlySubmissions)} responses / month
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIcon className="size-4 text-muted-foreground" /> {p.limits.maxFileUploadMb} MB file uploads
                  </div>
                  <Separator className="my-1" />
                  {(Object.keys(FEATURE_LABELS) as (keyof PlanFeatures)[]).map((k) => (
                    <div key={k} className={cn("flex items-center gap-2", !p.features[k] && "text-muted-foreground/60")}>
                      {p.features[k] ? <CheckIcon className="size-4" /> : <MinusIcon className="size-4" />}
                      {FEATURE_LABELS[k]}
                    </div>
                  ))}
                </CardContent>
                <CardFooter className="px-5">
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      Your plan
                    </Button>
                  ) : isUp ? (
                    p.slug === "free" ? (
                      <Button variant="outline" className="w-full" disabled>
                        Included
                      </Button>
                    ) : (
                      <Button className="w-full" onClick={() => openFor(p.id)} disabled={!!pendingReq}>
                        <SparklesIcon /> {p.priceLabel === "Custom" ? "Contact sales" : `Upgrade to ${p.name}`}
                      </Button>
                    )
                  ) : (
                    <Button variant="outline" className="w-full" onClick={() => openFor(p.id)} disabled={!!pendingReq}>
                      Switch to {p.name}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </div>

      {requests.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium">Request history</h2>
          <div className="divide-y rounded-lg border">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.planName}</div>
                  <div className="text-xs text-muted-foreground">Requested {formatDate(r.createdAt)}</div>
                  {r.adminResponse && <p className="mt-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-sm">“{r.adminResponse}”</p>}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    r.status === "APPROVED" && "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
                    r.status === "DECLINED" && "border-rose-500/30 text-rose-700 dark:text-rose-300"
                  )}
                >
                  {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Request {selected?.name ?? "upgrade"}</DialogTitle>
              <DialogDescription>
                {selected?.priceLabel === "Custom"
                  ? "Tell us about your needs and we’ll put together a plan."
                  : `${selected?.priceLabel ?? ""} · an admin activates your plan after a quick confirmation.`}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="gap-4">
              <Controller
                control={form.control}
                name="contactEmail"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="up-email">Contact email</FieldLabel>
                    <Input id="up-email" type="email" {...field} aria-invalid={fieldState.invalid} />
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="contactPhone"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="up-phone">Phone (optional)</FieldLabel>
                    <Input id="up-phone" type="tel" placeholder="+91 98765 43210" {...field} aria-invalid={fieldState.invalid} />
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="message"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="up-msg">Anything we should know?</FieldLabel>
                    <Textarea id="up-msg" rows={3} placeholder="Team size, expected volume, billing preferences…" {...field} aria-invalid={fieldState.invalid} />
                    <FieldDescription>Optional — helps us get you set up faster.</FieldDescription>
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner />} Send request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
