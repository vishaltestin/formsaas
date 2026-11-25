"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheckIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { grantFormAccess, revokeFormAccess, updateFormAccess } from "@/app/actions/form-access"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { initials } from "@/lib/format"
import { ACCESS_LEVELS, LEVEL_DESCRIPTIONS, LEVEL_LABELS, levelRank, ROLE_LABELS, type AccessLevel, type WorkspaceRole } from "@/lib/rbac/policy"

export interface AccessGrant {
  id: string
  kind: "member" | "group"
  name: string
  detail: string
  level: AccessLevel
}
export interface AccessCandidate {
  id: string
  kind: "member" | "group"
  name: string
  detail: string
}
export interface AutomaticAccess {
  name: string
  email: string
  role: WorkspaceRole
  reason: string
}

export function FormAccessPanel({
  formId,
  myLevel,
  grants,
  candidates,
  automatic,
}: {
  formId: string
  myLevel: AccessLevel
  grants: AccessGrant[]
  candidates: AccessCandidate[]
  automatic: AutomaticAccess[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [target, setTarget] = useState("")
  const [level, setLevel] = useState<AccessLevel>("VIEW")
  const grantable = ACCESS_LEVELS.filter((l) => levelRank(l) <= levelRank(myLevel))
  const free = candidates.filter((c) => !grants.some((g) => g.kind === c.kind && g.id.endsWith(`:${c.id}`)))
  const people = free.filter((c) => c.kind === "member")
  const teams = free.filter((c) => c.kind === "group")

  const add = () =>
    start(async () => {
      const [kind, id] = target.split(":")
      if (!id) return
      const res = await grantFormAccess(formId, kind === "group" ? { groupId: id, level } : { memberId: id, level })
      if (!res.ok) return void toast.error(res.error)
      const who = candidates.find((c) => c.id === id)?.name ?? "They"
      toast.success(`${who} now has ${LEVEL_LABELS[level]} access`)
      setTarget("")
      router.refresh()
    })

  const change = (g: AccessGrant, next: AccessLevel) =>
    start(async () => {
      const res = await updateFormAccess(formId, g.id.split(":")[0], next)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`${g.name}: ${LEVEL_LABELS[res.data.level]}`)
      router.refresh()
    })

  const revoke = (g: AccessGrant) =>
    start(async () => {
      const res = await revokeFormAccess(formId, g.id.split(":")[0])
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Removed ${g.name}`)
      router.refresh()
    })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Assign this form</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Give one person, or a whole group, a level of access. Group members inherit it automatically.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor="access-target">Person or group</FieldLabel>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id="access-target" className="w-full">
                  <SelectValue placeholder={free.length ? "Choose…" : "Everyone already has access"} />
                </SelectTrigger>
                <SelectContent>
                  {teams.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Groups</SelectLabel>
                      {teams.map((c) => (
                        <SelectItem key={c.id} value={`group:${c.id}`}>
                          {c.name} <span className="text-muted-foreground">· {c.detail}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {teams.length > 0 && people.length > 0 && <SelectSeparator />}
                  {people.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>People</SelectLabel>
                      {people.map((c) => (
                        <SelectItem key={c.id} value={`member:${c.id}`}>
                          {c.name} <span className="text-muted-foreground">· {c.detail}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="access-level">Access</FieldLabel>
              <Select value={level} onValueChange={(v) => setLevel(v as AccessLevel)}>
                <SelectTrigger id="access-level" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {grantable.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LEVEL_LABELS[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button onClick={add} disabled={pending || !target}>
              {pending ? <Spinner /> : <UserPlusIcon />} Assign
            </Button>
          </div>
          <FieldDescription className="mt-2">{LEVEL_DESCRIPTIONS[level]}</FieldDescription>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Assigned</h2>
          {grants.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>Not assigned to anyone yet</EmptyTitle>
                <EmptyDescription>Only owners, admins and the editor who created it can open this form right now.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y rounded-lg border">
              {grants.map((g) => {
                const above = levelRank(g.level) > levelRank(myLevel)
                return (
                  <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <Avatar className="size-8 rounded-md">
                      <AvatarFallback className="rounded-md text-xs">{g.kind === "group" ? <UsersIcon className="size-4" /> : initials(g.name, g.detail)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {g.name}
                        {g.kind === "group" && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                            Group
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{g.detail}</div>
                    </div>
                    <Select value={g.level} onValueChange={(v) => change(g, v as AccessLevel)} disabled={pending || above}>
                      <SelectTrigger size="sm" className="w-32" aria-label={`Access for ${g.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCESS_LEVELS.map((l) => (
                          <SelectItem key={l} value={l} disabled={levelRank(l) > levelRank(myLevel)}>
                            {LEVEL_LABELS[l]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon-sm" disabled={pending || above} onClick={() => revoke(g)} aria-label={`Remove ${g.name}`}>
                      <Trash2Icon />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Automatic access</h2>
          <ul className="divide-y rounded-lg border">
            {automatic.map((a) => (
              <li key={a.email} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar className="size-8 rounded-md">
                  <AvatarFallback className="rounded-md text-xs">{initials(a.name, a.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.name || a.email}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.reason}</div>
                </div>
                <Badge variant="secondary">{ROLE_LABELS[a.role]} · Manage</Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="space-y-3 text-sm">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheckIcon className="size-4 text-primary" /> Access levels
          </div>
          <dl className="mt-3 space-y-3">
            {ACCESS_LEVELS.map((l) => (
              <div key={l}>
                <dt className="font-medium">{LEVEL_LABELS[l]}</dt>
                <dd className="text-muted-foreground">{LEVEL_DESCRIPTIONS[l]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          You have <span className="font-medium text-foreground">{LEVEL_LABELS[myLevel]}</span> access, so you can assign up to that level. Every change is recorded in the team activity log.
        </p>
      </aside>
    </div>
  )
}
