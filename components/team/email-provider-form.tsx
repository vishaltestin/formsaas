"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2Icon, KeyRoundIcon, SendIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { removeEmailProvider, saveEmailProvider, sendProviderTest } from "@/app/actions/email-settings"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { providerFormSchema, SMTP_PORTS, WORKSPACE_PROVIDER_LABELS, WORKSPACE_PROVIDERS, type WorkspaceProviderKind } from "@/lib/email/workspace-config"

export interface SavedProvider {
  provider: WorkspaceProviderKind
  enabled: boolean
  fromEmail: string
  fromName: string
  replyTo: string
  sandbox: boolean
  inboxId: string
  host: string
  port: number
  secure: boolean
  username: string
  secretHint: string | null
  hasSecret: boolean
  lastTestAt: string | null
  lastTestOk: boolean | null
  lastError: string | null
  updatedAt: string
}

const BLURB: Record<WorkspaceProviderKind, string> = {
  BREVO: "Transactional API. Free plan sends 300 emails a day; the sender address must be verified in Brevo.",
  MAILTRAP: "Email Sending API, or the Sandbox to catch test mail in an inbox without delivering it.",
  SMTP: "Any SMTP server — Google Workspace, Microsoft 365, Amazon SES, Postmark, your own relay.",
}

type Values = {
  provider: WorkspaceProviderKind
  enabled: boolean
  fromEmail: string
  fromName: string
  replyTo: string
  apiKey: string
  sandbox: boolean
  inboxId: string
  host: string
  port: number
  secure: boolean
  username: string
  password: string
}

export function EmailProviderForm({ workspaceId, saved, platformSender }: { workspaceId: string; saved: SavedProvider | null; platformSender: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [testing, startTest] = useTransition()
  const [values, setValues] = useState<Values>(() => ({
    provider: saved?.provider ?? "BREVO",
    enabled: saved?.enabled ?? true,
    fromEmail: saved?.fromEmail ?? "",
    fromName: saved?.fromName ?? "",
    replyTo: saved?.replyTo ?? "",
    apiKey: "",
    sandbox: saved?.sandbox ?? false,
    inboxId: saved?.inboxId ?? "",
    host: saved?.host ?? "",
    port: saved?.port ?? 587,
    secure: saved?.secure ?? false,
    username: saved?.username ?? "",
    password: "",
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((p) => ({ ...p, [k]: v }))
  const keepsSecret = !!saved && saved.provider === values.provider && saved.hasSecret
  const secretLabel = values.provider === "SMTP" ? "Password" : values.provider === "BREVO" ? "API key" : "API token"

  const submit = () =>
    start(async () => {
      const parsed = providerFormSchema.safeParse(values)
      const next: Record<string, string> = {}
      if (!parsed.success) for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message
      if (values.provider !== "SMTP" && !values.apiKey && !keepsSecret) next.apiKey = `Enter the ${WORKSPACE_PROVIDER_LABELS[values.provider]} ${secretLabel.toLowerCase()}`
      setErrors(next)
      if (Object.keys(next).length) return
      const res = await saveEmailProvider(workspaceId, values)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`${WORKSPACE_PROVIDER_LABELS[values.provider]} saved${values.enabled ? " — send a test to confirm delivery" : ""}`)
      setValues((p) => ({ ...p, apiKey: "", password: "" }))
      router.refresh()
    })

  const test = () =>
    startTest(async () => {
      const res = await sendProviderTest(workspaceId)
      if (!res.ok) return void toast.error(res.error)
      if (res.data.sent) toast.success(`Test email sent to ${res.data.to}`)
      else toast.error(res.data.error ?? "The provider rejected the message")
      router.refresh()
    })

  const remove = () =>
    start(async () => {
      const res = await removeEmailProvider(workspaceId)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Disconnected — mail uses the platform sender again")
      router.refresh()
    })

  const dirtyProvider = saved && saved.provider !== values.provider

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-5">
        {saved && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {WORKSPACE_PROVIDER_LABELS[saved.provider]}
                <Badge variant={saved.enabled ? "default" : "outline"}>{saved.enabled ? "On" : "Off"}</Badge>
                {saved.lastTestOk === true && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2Icon className="size-3" /> Test delivered
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                From {saved.fromName ? `${saved.fromName} <${saved.fromEmail}>` : saved.fromEmail}
                {saved.secretHint && (
                  <>
                    {" "}
                    · <KeyRoundIcon className="inline size-3" /> ••••{saved.secretHint}
                  </>
                )}
                {saved.lastTestAt && <> · last test {saved.lastTestAt}</>}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={test} disabled={testing || pending || !saved.enabled}>
              {testing ? <Spinner /> : <SendIcon />} Send test
            </Button>
          </div>
        )}
        {saved?.lastError && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>The last delivery failed</AlertTitle>
            <AlertDescription className="break-words">{saved.lastError}</AlertDescription>
          </Alert>
        )}

        <FieldSet>
          <FieldLegend>Provider</FieldLegend>
          <ToggleGroup
            type="single"
            variant="outline"
            value={values.provider}
            onValueChange={(v) => v && set("provider", v as WorkspaceProviderKind)}
            className="w-full"
            aria-label="Email provider"
          >
            {WORKSPACE_PROVIDERS.map((p) => (
              <ToggleGroupItem key={p} value={p} className="flex-1">
                {WORKSPACE_PROVIDER_LABELS[p]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>{BLURB[values.provider]}</FieldDescription>
          {dirtyProvider && <FieldDescription className="text-amber-700 dark:text-amber-400">Switching provider replaces the saved {WORKSPACE_PROVIDER_LABELS[saved.provider]} credentials when you save.</FieldDescription>}
        </FieldSet>

        <FieldSet>
          <FieldLegend>Credentials</FieldLegend>
          <FieldGroup className="gap-4">
            {values.provider === "SMTP" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
                  <Field data-invalid={!!errors.host || undefined}>
                    <FieldLabel htmlFor="smtp-host">Host</FieldLabel>
                    <Input id="smtp-host" placeholder="smtp.example.com" autoComplete="off" value={values.host} onChange={(e) => set("host", e.target.value)} aria-invalid={!!errors.host} />
                    <FieldError>{errors.host}</FieldError>
                  </Field>
                  <Field data-invalid={!!errors.port || undefined}>
                    <FieldLabel htmlFor="smtp-port">Port</FieldLabel>
                    <Select value={String(values.port)} onValueChange={(v) => setValues((p) => ({ ...p, port: Number(v), secure: Number(v) === 465 ? true : p.secure }))}>
                      <SelectTrigger id="smtp-port" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SMTP_PORTS.map((p) => (
                          <SelectItem key={p} value={String(p)}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>{errors.port}</FieldError>
                  </Field>
                </div>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="smtp-secure">Implicit TLS</FieldLabel>
                    <FieldDescription>On for port 465. Other ports upgrade with STARTTLS; TLS 1.2+ is required either way.</FieldDescription>
                  </FieldContent>
                  <Switch id="smtp-secure" checked={values.secure || values.port === 465} disabled={values.port === 465} onCheckedChange={(c) => set("secure", c)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="smtp-user">Username</FieldLabel>
                    <Input id="smtp-user" autoComplete="off" value={values.username} onChange={(e) => set("username", e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="smtp-pass">{secretLabel}</FieldLabel>
                    <Input
                      id="smtp-pass"
                      type="password"
                      autoComplete="new-password"
                      placeholder={keepsSecret ? `Saved${saved?.secretHint ? ` ••••${saved.secretHint}` : ""} — leave blank to keep` : ""}
                      value={values.password}
                      onChange={(e) => set("password", e.target.value)}
                    />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <Field data-invalid={!!errors.apiKey || undefined}>
                  <FieldLabel htmlFor="provider-key">{secretLabel}</FieldLabel>
                  <Input
                    id="provider-key"
                    type="password"
                    autoComplete="off"
                    placeholder={keepsSecret ? `Saved${saved?.secretHint ? ` ••••${saved.secretHint}` : ""} — leave blank to keep` : values.provider === "BREVO" ? "xkeysib-…" : "Mailtrap API token"}
                    value={values.apiKey}
                    onChange={(e) => set("apiKey", e.target.value)}
                    aria-invalid={!!errors.apiKey}
                  />
                  <FieldDescription>Encrypted with AES-256-GCM before it is stored and never shown again — only the last four characters.</FieldDescription>
                  <FieldError>{errors.apiKey}</FieldError>
                </Field>
                {values.provider === "MAILTRAP" && (
                  <>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldLabel htmlFor="mt-sandbox">Sandbox</FieldLabel>
                        <FieldDescription>Catch every email in a Mailtrap test inbox instead of delivering it.</FieldDescription>
                      </FieldContent>
                      <Switch id="mt-sandbox" checked={values.sandbox} onCheckedChange={(c) => set("sandbox", c)} />
                    </Field>
                    {values.sandbox && (
                      <Field data-invalid={!!errors.inboxId || undefined}>
                        <FieldLabel htmlFor="mt-inbox">Test inbox id</FieldLabel>
                        <Input id="mt-inbox" inputMode="numeric" placeholder="e.g. 3241578" value={values.inboxId} onChange={(e) => set("inboxId", e.target.value)} aria-invalid={!!errors.inboxId} />
                        <FieldError>{errors.inboxId}</FieldError>
                      </Field>
                    )}
                  </>
                )}
              </>
            )}
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Sender</FieldLegend>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.fromEmail || undefined}>
                <FieldLabel htmlFor="from-email">From address</FieldLabel>
                <Input id="from-email" type="email" placeholder="forms@yourcompany.com" value={values.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} aria-invalid={!!errors.fromEmail} />
                <FieldError>{errors.fromEmail}</FieldError>
              </Field>
              <Field data-invalid={!!errors.fromName || undefined}>
                <FieldLabel htmlFor="from-name">From name</FieldLabel>
                <Input id="from-name" placeholder="Your company" maxLength={80} value={values.fromName} onChange={(e) => set("fromName", e.target.value)} aria-invalid={!!errors.fromName} />
                <FieldError>{errors.fromName}</FieldError>
              </Field>
            </div>
            <Field data-invalid={!!errors.replyTo || undefined}>
              <FieldLabel htmlFor="reply-to">Reply-to</FieldLabel>
              <Input id="reply-to" type="email" placeholder="Optional" value={values.replyTo} onChange={(e) => set("replyTo", e.target.value)} aria-invalid={!!errors.replyTo} />
              <FieldDescription>A form&rsquo;s own reply-to setting still wins for its thank-you emails.</FieldDescription>
              <FieldError>{errors.replyTo}</FieldError>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="provider-enabled">Use for this workspace</FieldLabel>
                <FieldDescription>When off, mail goes out from the platform sender ({platformSender}).</FieldDescription>
              </FieldContent>
              <Switch id="provider-enabled" checked={values.enabled} onCheckedChange={(c) => set("enabled", c)} />
            </Field>
          </FieldGroup>
        </FieldSet>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          {saved ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={pending}>
                  <Trash2Icon /> Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect {WORKSPACE_PROVIDER_LABELS[saved.provider]}?</AlertDialogTitle>
                  <AlertDialogDescription>The encrypted credentials are deleted. Form emails for this workspace go out from the platform sender again.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={remove}>
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span />
          )}
          <Button onClick={submit} disabled={pending}>
            {pending && <Spinner />} {saved ? "Save changes" : "Connect provider"}
          </Button>
        </div>
      </div>

      <aside className="space-y-3 text-sm">
        <div className="rounded-lg border p-4">
          <div className="font-medium">What uses this</div>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Thank-you emails to respondents</li>
            <li>New-response notifications</li>
            <li>Automation emails and approval requests</li>
            <li>Save-and-resume links</li>
            <li>Team invitations</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Account emails (password, billing) always come from the platform.</p>
        </div>
        <div className="rounded-lg border p-4 text-xs text-muted-foreground">
          <div className="mb-1 text-sm font-medium text-foreground">Security</div>
          Credentials are encrypted per workspace and only decrypted on the server at send time. SMTP connections to private or internal network addresses are refused. Only owners and admins can see this page.
        </div>
      </aside>
    </div>
  )
}
