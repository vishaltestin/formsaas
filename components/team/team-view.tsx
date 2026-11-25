"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, CopyIcon, CrownIcon, MailIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon, UserMinusIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { changeMemberRole, createGroup, deleteGroup, inviteMember, removeMember, resendInvite, revokeInvite, setGroupMembers, updateGroup } from "@/app/actions/team"
import { transferOwnership } from "@/app/actions/workspaces"
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { initials } from "@/lib/format"
import { canGrantRole, canManageMember, LEVEL_LABELS, ROLE_DESCRIPTIONS, ROLE_LABELS, WORKSPACE_ROLES, type AccessLevel, type WorkspaceRole } from "@/lib/rbac/policy"

export interface TeamMember {
  id: string
  userId: string
  name: string | null
  email: string
  role: WorkspaceRole
  groupIds: string[]
  grants: number
  joined: string
}
export interface TeamGroup {
  id: string
  name: string
  description: string | null
  memberIds: string[]
  forms: { formId: string; title: string; level: AccessLevel }[]
}
export interface TeamInvite {
  id: string
  email: string
  role: WorkspaceRole
  invitedBy: string | null
  expires: string
  expired: boolean
}
export interface TeamAudit {
  id: string
  when: string
  actor: string | null
  action: string
  summary: string
}

const GRANTABLE: WorkspaceRole[] = WORKSPACE_ROLES.filter((r) => r !== "OWNER")

function Person({ name, email, you }: { name: string | null; email: string; you?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar className="size-8 rounded-md">
        <AvatarFallback className="rounded-md text-xs">{initials(name, email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 truncate text-sm font-medium">
          {name || email.split("@")[0]}
          {you && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
              You
            </Badge>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{email}</div>
      </div>
    </div>
  )
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <InputGroup>
      <InputGroupInput readOnly value={value} aria-label={label} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label="Copy link"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true)
              toast.success("Link copied")
              setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

export function TeamView({
  workspaceId,
  workspaceName,
  me,
  can,
  members,
  groups,
  invites,
  audit,
  initialTab,
}: {
  workspaceId: string
  workspaceName: string
  me: { userId: string; role: WorkspaceRole }
  can: { invite: boolean; manage: boolean; groups: boolean; audit: boolean; transfer: boolean }
  members: TeamMember[]
  groups: TeamGroup[]
  invites: TeamInvite[]
  audit: TeamAudit[]
  initialTab: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tab, setTab] = useState(initialTab)

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("MEMBER")
  const [inviteGroups, setInviteGroups] = useState<string[]>([])
  const [inviteResult, setInviteResult] = useState<{ url: string; emailed: boolean; note: string | null } | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Group dialogs
  const [groupEdit, setGroupEdit] = useState<{ id: string | null; name: string; description: string } | null>(null)
  const [groupMembers, setGroupMembersState] = useState<{ id: string; name: string; ids: string[] } | null>(null)
  const [groupDelete, setGroupDelete] = useState<TeamGroup | null>(null)

  // Member dialogs
  const [removing, setRemoving] = useState<TeamMember | null>(null)
  const [transferTo, setTransferTo] = useState<TeamMember | null>(null)
  const [resent, setResent] = useState<{ email: string; url: string } | null>(null)

  const memberById = new Map(members.map((m) => [m.id, m]))
  const groupById = new Map(groups.map((g) => [g.id, g]))

  const openInvite = () => {
    setInviteEmail("")
    setInviteRole("MEMBER")
    setInviteGroups([])
    setInviteResult(null)
    setInviteError(null)
    setInviteOpen(true)
  }

  const submitInvite = () =>
    start(async () => {
      setInviteError(null)
      const res = await inviteMember(workspaceId, { email: inviteEmail, role: inviteRole, groupIds: inviteGroups })
      if (!res.ok) return void setInviteError(res.error)
      setInviteResult({ url: res.data.url, emailed: res.data.emailed, note: res.data.emailNote })
      router.refresh()
    })

  const changeRole = (m: TeamMember, role: WorkspaceRole) =>
    start(async () => {
      const res = await changeMemberRole(workspaceId, m.id, role)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`${m.name || m.email} is now ${ROLE_LABELS[res.data.role]}`)
      router.refresh()
    })

  const confirmRemove = () =>
    start(async () => {
      if (!removing) return
      const res = await removeMember(workspaceId, removing.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Removed ${removing.name || removing.email}`)
      setRemoving(null)
      router.refresh()
    })

  const confirmTransfer = () =>
    start(async () => {
      if (!transferTo) return
      const res = await transferOwnership(workspaceId, transferTo.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`${transferTo.name || transferTo.email} now owns ${workspaceName}`)
      setTransferTo(null)
      router.refresh()
    })

  const saveGroup = () =>
    start(async () => {
      if (!groupEdit) return
      const res = groupEdit.id
        ? await updateGroup(workspaceId, groupEdit.id, { name: groupEdit.name, description: groupEdit.description })
        : await createGroup(workspaceId, { name: groupEdit.name, description: groupEdit.description })
      if (!res.ok) return void toast.error(res.error)
      toast.success(groupEdit.id ? "Group updated" : "Group created")
      setGroupEdit(null)
      router.refresh()
    })

  const saveGroupMembers = () =>
    start(async () => {
      if (!groupMembers) return
      const res = await setGroupMembers(workspaceId, groupMembers.id, groupMembers.ids)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`${groupMembers.name}: ${res.data.count} member${res.data.count === 1 ? "" : "s"}`)
      setGroupMembersState(null)
      router.refresh()
    })

  const confirmDeleteGroup = () =>
    start(async () => {
      if (!groupDelete) return
      const res = await deleteGroup(workspaceId, groupDelete.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Deleted ${groupDelete.name}`)
      setGroupDelete(null)
      router.refresh()
    })

  const doResend = (inv: TeamInvite) =>
    start(async () => {
      const res = await resendInvite(workspaceId, inv.id)
      if (!res.ok) return void toast.error(res.error)
      setResent({ email: inv.email, url: res.data.url })
      if (res.data.emailed) toast.success(`Invitation re-sent to ${inv.email}`)
      router.refresh()
    })

  const doRevoke = (inv: TeamInvite) =>
    start(async () => {
      const res = await revokeInvite(workspaceId, inv.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Invitation for ${inv.email} revoked`)
      router.refresh()
    })

  return (
    <>
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList variant="line">
            <TabsTrigger value="members">
              Members <span className="ml-1 font-mono text-xs text-muted-foreground tabular-nums">{members.length}</span>
            </TabsTrigger>
            <TabsTrigger value="groups">
              Groups <span className="ml-1 font-mono text-xs text-muted-foreground tabular-nums">{groups.length}</span>
            </TabsTrigger>
            {can.invite && (
              <TabsTrigger value="invites">
                Invitations <span className="ml-1 font-mono text-xs text-muted-foreground tabular-nums">{invites.length}</span>
              </TabsTrigger>
            )}
            {can.audit && <TabsTrigger value="activity">Activity</TabsTrigger>}
          </TabsList>
          <div className="flex gap-2">
            {can.groups && tab === "groups" && (
              <Button size="sm" variant="outline" onClick={() => setGroupEdit({ id: null, name: "", description: "" })}>
                <PlusIcon /> New group
              </Button>
            )}
            {can.invite && (
              <Button size="sm" onClick={openInvite}>
                <UserPlusIcon /> Invite people
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="members" className="space-y-4">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Person</TableHead>
                  <TableHead className="w-44">Role</TableHead>
                  <TableHead>Groups</TableHead>
                  <TableHead className="text-right">Form grants</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const self = m.userId === me.userId
                  const manage = canManageMember(me.role, m.role, { self })
                  const showTransfer = can.transfer && !self
                  const showRemove = manage.ok
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="pl-4">
                        <Person name={m.name} email={m.email} you={self} />
                      </TableCell>
                      <TableCell>
                        {manage.ok ? (
                          <Select value={m.role} onValueChange={(v) => changeRole(m, v as WorkspaceRole)} disabled={pending}>
                            <SelectTrigger size="sm" className="w-36" aria-label={`Role for ${m.email}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {GRANTABLE.map((r) => (
                                <SelectItem key={r} value={r} disabled={!canGrantRole(me.role, r).ok}>
                                  {ROLE_LABELS[r]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={m.role === "OWNER" ? "default" : "secondary"} className="gap-1">
                            {m.role === "OWNER" && <CrownIcon className="size-3" />}
                            {ROLE_LABELS[m.role]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {m.groupIds.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          {m.groupIds.map((g) => (
                            <Badge key={g} variant="outline" className="font-normal">
                              {groupById.get(g)?.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {m.role === "OWNER" || m.role === "ADMIN" ? <span className="text-xs text-muted-foreground">All forms</span> : m.grants}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.joined}</TableCell>
                      <TableCell>
                        {(showTransfer || showRemove) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.email}`}>
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              {showTransfer && (
                                <DropdownMenuItem onSelect={() => setTransferTo(m)}>
                                  <CrownIcon /> Transfer ownership
                                </DropdownMenuItem>
                              )}
                              {showTransfer && showRemove && <DropdownMenuSeparator />}
                              {showRemove && (
                                <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(m)}>
                                  <UserMinusIcon /> Remove from workspace
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <dl className="grid gap-x-6 gap-y-2 rounded-lg border px-4 py-3 text-sm sm:grid-cols-2">
            {WORKSPACE_ROLES.map((r) => (
              <div key={r} className="flex gap-2">
                <dt className="w-16 shrink-0 font-medium">{ROLE_LABELS[r]}</dt>
                <dd className="text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</dd>
              </div>
            ))}
          </dl>
        </TabsContent>

        <TabsContent value="groups">
          {groups.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>No groups yet</EmptyTitle>
                <EmptyDescription>
                  Groups bundle people by function — Support, Sales, HR — so a whole kind of form can be assigned to a whole kind of person in one step.
                </EmptyDescription>
              </EmptyHeader>
              {can.groups && (
                <Button size="sm" onClick={() => setGroupEdit({ id: null, name: "", description: "" })}>
                  <PlusIcon /> Create a group
                </Button>
              )}
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Group</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Forms</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="pl-4 align-top">
                        <div className="font-medium">{g.name}</div>
                        {g.description && <div className="max-w-xs text-xs text-muted-foreground">{g.description}</div>}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-1">
                          {g.memberIds.length === 0 && <span className="text-xs text-muted-foreground">Nobody yet</span>}
                          {g.memberIds.map((id) => {
                            const m = memberById.get(id)
                            return m ? (
                              <Badge key={id} variant="outline" className="font-normal">
                                {m.name || m.email}
                              </Badge>
                            ) : null
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-1">
                          {g.forms.length === 0 && <span className="text-xs text-muted-foreground">Assign from a form&rsquo;s Access tab</span>}
                          {g.forms.map((f) => (
                            <Badge key={f.formId} variant="secondary" className="font-normal">
                              {f.title} · {LEVEL_LABELS[f.level]}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        {can.groups && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${g.name}`}>
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onSelect={() => setGroupMembersState({ id: g.id, name: g.name, ids: g.memberIds })}>
                                <UsersIcon /> Choose members
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setGroupEdit({ id: g.id, name: g.name, description: g.description ?? "" })}>
                                <PencilIcon /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => setGroupDelete(g)}>
                                <Trash2Icon /> Delete group
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {can.invite && (
          <TabsContent value="invites" className="space-y-3">
            {resent && (
              <Alert>
                <MailIcon />
                <AlertTitle>New link for {resent.email}</AlertTitle>
                <AlertDescription className="w-full space-y-2">
                  <p>The previous link no longer works. This one is valid for 7 days and can be used once.</p>
                  <CopyField value={resent.url} label="Invitation link" />
                </AlertDescription>
              </Alert>
            )}
            {invites.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MailIcon />
                  </EmptyMedia>
                  <EmptyTitle>No pending invitations</EmptyTitle>
                  <EmptyDescription>Invitations expire after 7 days and can only be accepted by the invited email address.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="pl-4">Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Invited by</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-48" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invites.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="pl-4 font-medium">{inv.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{ROLE_LABELS[inv.role]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{inv.invitedBy ?? "—"}</TableCell>
                        <TableCell className="text-xs">{inv.expired ? <Badge variant="outline">Expired</Badge> : <span className="text-muted-foreground">{inv.expires}</span>}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" disabled={pending || !canGrantRole(me.role, inv.role).ok} onClick={() => doResend(inv)}>
                              <RefreshCwIcon /> {inv.expired ? "Renew" : "Resend"}
                            </Button>
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => doRevoke(inv)} aria-label={`Revoke invitation for ${inv.email}`}>
                              <XIcon /> Revoke
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        )}

        {can.audit && (
          <TabsContent value="activity">
            {audit.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>No activity yet</EmptyTitle>
                  <EmptyDescription>Role changes, invitations, access grants and email settings are recorded here.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ol className="divide-y rounded-lg border">
                {audit.map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
                    <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{a.when}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{a.actor ?? "Someone"}</span> <span className="text-muted-foreground">·</span> {a.summary}
                    </span>
                    <code className="shrink-0 text-[11px] text-muted-foreground">{a.action}</code>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Invite */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{inviteResult ? "Invitation created" : `Invite to ${workspaceName}`}</DialogTitle>
            <DialogDescription>
              {inviteResult
                ? inviteResult.emailed
                  ? `We emailed ${inviteEmail}. You can also share the link below.`
                  : (inviteResult.note ?? "Share the link below.")
                : "They'll join with the role you pick. Only the invited address can accept, and the link expires in 7 days."}
            </DialogDescription>
          </DialogHeader>
          {inviteResult ? (
            <div className="space-y-3">
              <CopyField value={inviteResult.url} label="Invitation link" />
              <p className="text-xs text-muted-foreground">This link is shown once. If it&rsquo;s lost, use “Resend” on the Invitations tab to issue a new one.</p>
            </div>
          ) : (
            <FieldGroup className="gap-4">
              {inviteError && (
                <Alert variant="destructive">
                  <AlertDescription>{inviteError}</AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                <Input id="invite-email" type="email" autoComplete="off" placeholder="teammate@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as WorkspaceRole)}>
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRANTABLE.map((r) => (
                      <SelectItem key={r} value={r} disabled={!canGrantRole(me.role, r).ok}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{ROLE_DESCRIPTIONS[inviteRole]}</FieldDescription>
              </Field>
              {groups.length > 0 && (
                <Field>
                  <FieldLabel>Add to groups</FieldLabel>
                  <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                    {groups.map((g) => (
                      <label key={g.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={inviteGroups.includes(g.id)}
                          onCheckedChange={(c) => setInviteGroups((prev) => (c ? [...prev, g.id] : prev.filter((x) => x !== g.id)))}
                        />
                        {g.name}
                      </label>
                    ))}
                  </div>
                  <FieldDescription>They inherit every form the group can access.</FieldDescription>
                </Field>
              )}
            </FieldGroup>
          )}
          <DialogFooter>
            {inviteResult ? (
              <>
                <Button variant="outline" onClick={() => { setInviteResult(null); setInviteEmail("") }}>
                  Invite another
                </Button>
                <Button onClick={() => setInviteOpen(false)}>Done</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submitInvite} disabled={pending || !inviteEmail.trim()}>
                  {pending && <Spinner />} Send invitation
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / rename group */}
      <Dialog open={!!groupEdit} onOpenChange={(o) => !o && setGroupEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{groupEdit?.id ? "Edit group" : "New group"}</DialogTitle>
            <DialogDescription>Name it after a function, e.g. “Support desk” or “Recruiting”.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="group-name">Name</FieldLabel>
              <Input id="group-name" maxLength={80} value={groupEdit?.name ?? ""} onChange={(e) => setGroupEdit((g) => (g ? { ...g, name: e.target.value } : g))} />
            </Field>
            <Field>
              <FieldLabel htmlFor="group-desc">Description</FieldLabel>
              <Textarea id="group-desc" rows={2} maxLength={300} value={groupEdit?.description ?? ""} onChange={(e) => setGroupEdit((g) => (g ? { ...g, description: e.target.value } : g))} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupEdit(null)}>
              Cancel
            </Button>
            <Button onClick={saveGroup} disabled={pending || (groupEdit?.name.trim().length ?? 0) < 2}>
              {pending && <Spinner />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group members */}
      <Dialog open={!!groupMembers} onOpenChange={(o) => !o && setGroupMembersState(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Members of {groupMembers?.name}</DialogTitle>
            <DialogDescription>Owners and admins already see every form, so adding them only matters for organisation.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-72 rounded-md border">
            <div className="divide-y">
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    checked={groupMembers?.ids.includes(m.id) ?? false}
                    onCheckedChange={(c) => setGroupMembersState((g) => (g ? { ...g, ids: c ? [...g.ids, m.id] : g.ids.filter((x) => x !== m.id) } : g))}
                  />
                  <Person name={m.name} email={m.email} />
                  <Badge variant="outline" className="ml-auto font-normal">
                    {ROLE_LABELS[m.role]}
                  </Badge>
                </label>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupMembersState(null)}>
              Cancel
            </Button>
            <Button onClick={saveGroupMembers} disabled={pending}>
              {pending && <Spinner />} Save members
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!groupDelete} onOpenChange={(o) => !o && setGroupDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{groupDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Members lose any form access they only had through this group{groupDelete?.forms.length ? ` (${groupDelete.forms.length} form${groupDelete.forms.length === 1 ? "" : "s"})` : ""}. People stay in the workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={(e) => { e.preventDefault(); confirmDeleteGroup() }}>
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name || removing?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to {workspaceName} immediately: every form grant and group seat is removed and their API keys for this workspace are revoked. Forms they created stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={(e) => { e.preventDefault(); confirmRemove() }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!transferTo} onOpenChange={(o) => !o && setTransferTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer ownership to {transferTo?.name || transferTo?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They become the owner and billing owner of every form in {workspaceName} — form and response limits come from their plan. You stay on as an Admin and can&rsquo;t undo this yourself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={(e) => { e.preventDefault(); confirmTransfer() }}>
              Transfer ownership
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
