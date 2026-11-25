"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CheckCircle2Icon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SendIcon,
  Trash2Icon,
  WebhookIcon,
  XCircleIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  createWebhook,
  deleteWebhook,
  retryDelivery,
  rotateWebhookSecret,
  sendTestWebhook,
  toggleWebhook,
  updateWebhook,
} from "@/app/actions/webhooks"
import { LockedNotice } from "@/components/builder/inspector-controls"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDateTime, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface DeliveryRow {
  id: string
  event: string
  statusCode: number | null
  responseMs: number | null
  success: boolean
  attempt: number
  createdAt: string
  payload: unknown
  responseBody: string | null
  error: string | null
}

export interface WebhookRow {
  id: string
  name: string
  url: string
  secret: string
  headers: Record<string, string>
  isActive: boolean
  createdAt: string
  successRate: number | null
  deliveries: DeliveryRow[]
}

const VERIFY_SNIPPET = `import crypto from "node:crypto"

// header: X-FormStudio-Signature: t=<unix>,v1=<hex>
export function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")))
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${parts.t}.\${rawBody}\`)
    .digest("hex")
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300
  return fresh && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
}`

function copy(text: string, label = "Copied") {
  void navigator.clipboard.writeText(text).then(() => toast.success(label))
}

function StatusPill({ d }: { d: Pick<DeliveryRow, "success" | "statusCode" | "error"> }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-mono text-xs font-normal",
        d.success ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "border-rose-500/30 text-rose-700 dark:text-rose-300"
      )}
    >
      {d.success ? <CheckCircle2Icon className="size-3" /> : <XCircleIcon className="size-3" />}
      {d.statusCode ?? "ERR"}
    </Badge>
  )
}

type HeaderPair = { key: string; value: string }

function WebhookDialog({
  open,
  onOpenChange,
  formId,
  editing,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  formId: string
  editing: WebhookRow | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState(editing?.name ?? "")
  const [url, setUrl] = useState(editing?.url ?? "")
  const [headers, setHeaders] = useState<HeaderPair[]>(
    editing ? Object.entries(editing.headers).map(([key, value]) => ({ key, value })) : []
  )
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const input = { name, url, headers, isActive: editing?.isActive ?? true }
      const res = editing ? await updateWebhook(editing.id, input) : await createWebhook(formId, input)
      if (!res.ok) return void setError(res.error)
      toast.success(editing ? "Webhook updated" : "Webhook created")
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit webhook" : "Add webhook"}</DialogTitle>
            <DialogDescription>We POST a signed JSON payload to this URL each time a response is submitted.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="wh-name">Name</FieldLabel>
              <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="CRM sync" maxLength={60} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="wh-url">Endpoint URL</FieldLabel>
              <Input id="wh-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/…" required />
              <FieldDescription>Works with Zapier, Make, n8n, Slack workflows or your own API.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Custom headers</FieldLabel>
              <div className="space-y-2">
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      placeholder="Authorization"
                      value={h.key}
                      onChange={(e) => setHeaders((hs) => hs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                      className="font-mono text-xs"
                    />
                    <Input
                      placeholder="Bearer …"
                      value={h.value}
                      onChange={(e) => setHeaders((hs) => hs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      className="font-mono text-xs"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setHeaders((hs) => hs.filter((_, j) => j !== i))} aria-label="Remove header">
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
                {headers.length < 10 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setHeaders((hs) => [...hs, { key: "", value: "" }])}>
                    <PlusIcon /> Add header
                  </Button>
                )}
              </div>
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? "Save changes" : "Create webhook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeliverySheet({ delivery, onClose }: { delivery: DeliveryRow | null; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (!delivery) return null
  const retry = () =>
    start(async () => {
      const res = await retryDelivery(delivery.id)
      if (!res.ok) return void toast.error(res.error)
      if (res.data.success) toast.success(`Redelivered · ${res.data.statusCode}`)
      else toast.error(`Retry failed · ${res.data.error ?? res.data.statusCode}`)
      onClose()
      router.refresh()
    })
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            Delivery <StatusPill d={delivery} />
          </SheetTitle>
          <SheetDescription>
            {delivery.event} · attempt {delivery.attempt} · {formatDateTime(delivery.createdAt)}
            {delivery.responseMs !== null && ` · ${delivery.responseMs} ms`}
          </SheetDescription>
          <div className="pt-2">
            <Button size="sm" variant="outline" onClick={retry} disabled={pending}>
              <RotateCcwIcon className={cn(pending && "animate-spin")} /> Redeliver
            </Button>
          </div>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-4">
            {delivery.error && (
              <Alert variant="destructive">
                <XCircleIcon />
                <AlertTitle>Request error</AlertTitle>
                <AlertDescription>{delivery.error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Request body</span>
                <Button variant="ghost" size="sm" className="h-7" onClick={() => copy(JSON.stringify(delivery.payload, null, 2), "Payload copied")}>
                  <CopyIcon /> Copy
                </Button>
              </div>
              <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">{JSON.stringify(delivery.payload, null, 2)}</pre>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Response body</span>
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">{delivery.responseBody || "(empty)"}</pre>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function WebhookCard({ hook, onEdit, onDelete, onOpenDelivery }: { hook: WebhookRow; onEdit: () => void; onDelete: () => void; onOpenDelivery: (d: DeliveryRow) => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [reveal, setReveal] = useState(false)

  const test = () =>
    start(async () => {
      const res = await sendTestWebhook(hook.id)
      if (!res.ok) return void toast.error(res.error)
      if (res.data.success) toast.success(`Test delivered · HTTP ${res.data.statusCode}`)
      else toast.error(`Test failed · ${res.data.error ?? `HTTP ${res.data.statusCode}`}`)
      router.refresh()
    })
  const toggle = (on: boolean) =>
    start(async () => {
      const res = await toggleWebhook(hook.id, on)
      if (!res.ok) return void toast.error(res.error)
      toast.success(on ? "Webhook enabled" : "Webhook paused")
      router.refresh()
    })
  const rotate = () =>
    start(async () => {
      const res = await rotateWebhookSecret(hook.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Signing secret rotated")
      setReveal(true)
      router.refresh()
    })

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          {hook.name}
          {!hook.isActive && <Badge variant="secondary">Paused</Badge>}
          {hook.successRate !== null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="font-normal tabular-nums">
                  {Math.round(hook.successRate * 100)}% success
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Across the last {hook.deliveries.length} deliveries</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <CardDescription className="truncate font-mono text-xs">{hook.url}</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Switch checked={hook.isActive} onCheckedChange={toggle} disabled={pending} aria-label="Active" />
          <Button variant="outline" size="sm" onClick={test} disabled={pending}>
            <SendIcon /> Send test
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Webhook actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={rotate}>
                <RefreshCwIcon /> Rotate secret
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <Field>
          <FieldLabel className="text-xs text-muted-foreground">Signing secret</FieldLabel>
          <InputGroup className="h-8">
            <InputGroupInput readOnly value={reveal ? hook.secret : "whsec_" + "•".repeat(24)} className="font-mono text-xs" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" onClick={() => setReveal((r) => !r)} aria-label={reveal ? "Hide secret" : "Reveal secret"}>
                {reveal ? <EyeOffIcon /> : <EyeIcon />}
              </InputGroupButton>
              <InputGroupButton size="icon-xs" onClick={() => copy(hook.secret, "Secret copied")} aria-label="Copy secret">
                <CopyIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Recent deliveries</div>
          {hook.deliveries.length ? (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8">Status</TableHead>
                    <TableHead className="h-8">Event</TableHead>
                    <TableHead className="h-8">Attempt</TableHead>
                    <TableHead className="h-8">Duration</TableHead>
                    <TableHead className="h-8 text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hook.deliveries.map((d) => (
                    <TableRow key={d.id} className="cursor-pointer" onClick={() => onOpenDelivery(d)}>
                      <TableCell className="py-1.5">
                        <StatusPill d={d} />
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs">{d.event}</TableCell>
                      <TableCell className="py-1.5 tabular-nums">{d.attempt}</TableCell>
                      <TableCell className="py-1.5 tabular-nums text-muted-foreground">{d.responseMs !== null ? `${d.responseMs} ms` : "—"}</TableCell>
                      <TableCell className="py-1.5 text-right text-muted-foreground" title={formatDateTime(d.createdAt)}>
                        {timeAgo(d.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">No deliveries yet — send a test to check your endpoint.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function WebhooksPanel({
  formId,
  hooks,
  enabled,
  webhooksOn,
}: {
  formId: string
  hooks: WebhookRow[]
  enabled: boolean
  webhooksOn: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [dialog, setDialog] = useState<{ open: boolean; editing: WebhookRow | null; key: number }>({ open: false, editing: null, key: 0 })
  const [deleting, setDeleting] = useState<WebhookRow | null>(null)
  const [delivery, setDelivery] = useState<DeliveryRow | null>(null)

  const openDialog = (editing: WebhookRow | null) => setDialog((d) => ({ open: true, editing, key: d.key + 1 }))

  if (!enabled) {
    return (
      <div className="max-w-xl">
        <LockedNotice title="Webhooks are a Pro feature">
          Send signed JSON payloads to Zapier, Make, Slack or your own API the moment a response arrives.
        </LockedNotice>
      </div>
    )
  }

  const confirmDelete = () =>
    start(async () => {
      if (!deleting) return
      const res = await deleteWebhook(deleting.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Webhook deleted")
      setDeleting(null)
      router.refresh()
    })

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-3">
        {!webhooksOn && hooks.length > 0 && (
          <Alert>
            <WebhookIcon />
            <AlertTitle>Webhooks are switched off for this form</AlertTitle>
            <AlertDescription>
              <span>
                Live submissions won’t be delivered until you enable “Send webhooks on submit” in{" "}
                <Link href={`/dashboard/forms/${formId}/edit`} className="underline underline-offset-2">
                  form settings
                </Link>
                . Test deliveries still work.
              </span>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">
            Webhooks <span className="text-muted-foreground">({hooks.length}/10)</span>
          </h2>
          <Button size="sm" onClick={() => openDialog(null)} disabled={hooks.length >= 10}>
            <PlusIcon /> Add webhook
          </Button>
        </div>
        {hooks.length ? (
          hooks.map((h) => (
            <WebhookCard key={h.id} hook={h} onEdit={() => openDialog(h)} onDelete={() => setDeleting(h)} onOpenDelivery={setDelivery} />
          ))
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WebhookIcon />
              </EmptyMedia>
              <EmptyTitle>No webhooks yet</EmptyTitle>
              <EmptyDescription>Push every new response to your CRM, Slack or database in real time.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={() => openDialog(null)}>
                <PlusIcon /> Add webhook
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>

      <aside className="space-y-3">
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">How delivery works</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <Accordion type="single" collapsible defaultValue="sig" className="text-sm">
              <AccordionItem value="sig">
                <AccordionTrigger className="py-2 text-sm">Verifying signatures</AccordionTrigger>
                <AccordionContent className="space-y-2">
                  <p className="text-muted-foreground">
                    Each request carries <code className="rounded bg-muted px-1 text-xs">X-FormStudio-Signature</code> — an HMAC-SHA256 of{" "}
                    <code className="rounded bg-muted px-1 text-xs">timestamp.body</code> using your secret.
                  </p>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed">{VERIFY_SNIPPET}</pre>
                    <Button variant="ghost" size="icon" className="absolute top-1 right-1 size-7" onClick={() => copy(VERIFY_SNIPPET, "Snippet copied")} aria-label="Copy snippet">
                      <CopyIcon />
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="payload">
                <AccordionTrigger className="py-2 text-sm">Payload shape</AccordionTrigger>
                <AccordionContent>
                  <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed">{`{
  "event": "submission.created",
  "createdAt": "2026-01-01T10:00:00Z",
  "form": { "id", "title", "slug" },
  "submission": {
    "id": "…",
    "score": null,
    "data": { "<field_key>": "…" }
  }
}`}</pre>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="retry" className="border-b-0">
                <AccordionTrigger className="py-2 text-sm">Timeouts & retries</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Endpoints must answer with a 2xx within 10 seconds. Failed deliveries are logged here — open one to inspect it and redeliver.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </aside>

      {dialog.open && (
        <WebhookDialog key={dialog.key} open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} formId={formId} editing={dialog.editing} />
      )}
      <DeliverySheet key={delivery?.id} delivery={delivery} onClose={() => setDelivery(null)} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The endpoint stops receiving responses and its delivery history is removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
            >
              Delete webhook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
