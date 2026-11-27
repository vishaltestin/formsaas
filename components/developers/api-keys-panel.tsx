"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, CopyIcon, KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { createApiKey, deleteApiKey, revokeApiKey } from "@/app/actions/developers"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { API_SCOPES, SCOPE_DESCRIPTIONS, type ApiScope } from "@/lib/api/scopes"

export interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  scopes: string[]
  rateLimit: number
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  requests24h: number
}

function keyState(k: ApiKeyRow, now: number) {
  if (k.revokedAt) return "revoked"
  if (k.expiresAt && new Date(k.expiresAt).getTime() < now) return "expired"
  return "active"
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }
    >
      {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />} {copied ? "Copied" : label}
    </Button>
  )
}

export function ApiKeysPanel({ keys, now, onKeyCreated }: { keys: ApiKeyRow[]; now: number; onKeyCreated: (raw: string) => void }) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("Production server")
  const [scopes, setScopes] = useState<ApiScope[]>(["forms:read", "submissions:read", "submissions:write"])
  const [expiry, setExpiry] = useState("90")
  const [rateLimit, setRateLimit] = useState(120)
  const [revealed, setRevealed] = useState<{ raw: string; prefix: string } | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null)
  const [pending, startTransition] = useTransition()

  const create = () =>
    startTransition(async () => {
      const res = await createApiKey({ name, scopes, expiresInDays: expiry === "never" ? null : Number(expiry), rateLimit })
      if (!res.ok) return void toast.error(res.error)
      setCreateOpen(false)
      setRevealed({ raw: res.data.raw, prefix: res.data.prefix })
      onKeyCreated(res.data.raw)
      router.refresh()
    })

  const revoke = (k: ApiKeyRow) =>
    startTransition(async () => {
      const res = await revokeApiKey(k.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Revoked ${k.prefix}…`)
      setRevokeTarget(null)
      router.refresh()
    })

  const remove = (k: ApiKeyRow) =>
    startTransition(async () => {
      const res = await deleteApiKey(k.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Key deleted")
      router.refresh()
    })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Keys authenticate server-to-server requests. Only a SHA-256 hash is stored — the secret is shown once.</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" /> Create key
        </Button>
      </div>

      {keys.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRoundIcon />
            </EmptyMedia>
            <EmptyTitle>No API keys</EmptyTitle>
            <EmptyDescription>Create a scoped key to call the REST API from your backend.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon data-icon="inline-start" /> Create key
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead className="text-right">24h</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => {
                const state = keyState(k, now)
                return (
                  <TableRow key={k.id} className={state !== "active" ? "text-muted-foreground" : undefined}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {k.name}
                        {state !== "active" && <Badge variant="outline">{state}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{k.prefix}…</TableCell>
                    <TableCell>
                      <div className="flex max-w-72 flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <Badge key={s} variant="secondary" className="font-mono text-[10px] font-normal">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{k.rateLimit}/min</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{k.requests24h}</TableCell>
                    <TableCell className="text-xs">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}</TableCell>
                    <TableCell className="text-xs">{k.expiresAt ? fmtDate(k.expiresAt) : "Never"}</TableCell>
                    <TableCell className="text-right">
                      {state === "revoked" ? (
                        <Button variant="ghost" size="xs" disabled={pending} onClick={() => remove(k)}>
                          <Trash2Icon data-icon="inline-start" /> Delete
                        </Button>
                      ) : (
                        <Button variant="ghost" size="xs" disabled={pending} onClick={() => setRevokeTarget(k)}>
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>Grant only the scopes this integration needs.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="key-name">Name</FieldLabel>
              <Input id="key-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Field>
            <FieldSet>
              <FieldLegend variant="label">Scopes</FieldLegend>
              <div className="grid gap-2">
                {API_SCOPES.map((s) => (
                  <Field key={s} orientation="horizontal">
                    <Checkbox id={`scope-${s}`} checked={scopes.includes(s)} onCheckedChange={(v) => setScopes((xs) => (v ? [...xs, s] : xs.filter((x) => x !== s)))} />
                    <FieldLabel htmlFor={`scope-${s}`} className="flex-col items-start gap-0 font-normal">
                      <span className="font-mono text-xs">{s}</span>
                      <span className="text-xs text-muted-foreground">{SCOPE_DESCRIPTIONS[s]}</span>
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            </FieldSet>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="key-exp">Expires</FieldLabel>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger id="key-exp" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">In 7 days</SelectItem>
                    <SelectItem value="30">In 30 days</SelectItem>
                    <SelectItem value="90">In 90 days</SelectItem>
                    <SelectItem value="365">In 1 year</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="key-rl">Rate limit / min</FieldLabel>
                <Input id="key-rl" type="number" min={10} max={1000} className="font-mono tabular-nums" value={rateLimit} onChange={(e) => setRateLimit(Number(e.target.value) || 10)} />
              </Field>
            </div>
            <FieldDescription>Rate limits are enforced per key in the database across all server instances.</FieldDescription>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={pending || scopes.length === 0 || !name.trim()}>
              {pending && <Spinner data-icon="inline-start" />} Create key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealed} onOpenChange={(v) => !v && setRevealed(null)}>
        <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Save your API key</DialogTitle>
            <DialogDescription>This is the only time the full key is shown. Store it in a secret manager.</DialogDescription>
          </DialogHeader>
          {revealed && (
            <div className="space-y-3">
              <code className="block rounded-md border bg-muted/40 p-3 font-mono text-xs break-all select-all">{revealed.raw}</code>
              <div className="flex gap-2">
                <CopyButton value={revealed.raw} label="Copy key" />
              </div>
              <Alert>
                <KeyRoundIcon />
                <AlertTitle>Loaded into the playground</AlertTitle>
                <AlertDescription>The key is kept in this browser tab only, so you can try requests right away.</AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>I&apos;ve saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revokeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Requests using {revokeTarget?.prefix}… will fail immediately with 401. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => revokeTarget && revoke(revokeTarget)}>
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
