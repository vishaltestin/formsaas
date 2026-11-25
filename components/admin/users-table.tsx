"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  SearchIcon,
  ShieldIcon,
  ShieldOffIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import { assignPlan, revokeSubscription, setUserRole } from "@/app/actions/billing"
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatDate, initials, timeAgo } from "@/lib/format"
import { formatLimit } from "@/lib/plans"
import { cn } from "@/lib/utils"

export interface AdminUserRow {
  id: string
  name: string | null
  email: string
  role: "USER" | "ADMIN"
  createdAt: string
  forms: number
  monthlySubmissions: number
  sub: {
    planId: string
    planName: string
    status: "ACTIVE" | "EXPIRED"
    expiresAt: string | null
    adminNotes: string | null
    assignedBy: string | null
    effective: boolean
  } | null
  effectivePlanName: string
  limits: { maxForms: number; monthlySubmissions: number }
}

export interface PlanOption {
  id: string
  name: string
  slug: string
  priceLabel: string
}

const DAY = 86400000
function tomorrow() {
  return new Date(Date.now() + DAY)
}
type Preset = "30" | "90" | "365" | "never" | "custom"

function AssignSheet({ user, plans, onClose, selfId }: { user: AdminUserRow; plans: PlanOption[]; onClose: () => void; selfId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [planId, setPlanId] = useState(user.sub?.planId ?? plans.find((p) => p.slug === "pro")?.id ?? plans[0]?.id ?? "")
  const [preset, setPreset] = useState<Preset>(user.sub?.expiresAt ? "custom" : "never")
  const [custom, setCustom] = useState<Date | undefined>(user.sub?.expiresAt && new Date(user.sub.expiresAt) > new Date() ? new Date(user.sub.expiresAt) : undefined)
  const [notes, setNotes] = useState(user.sub?.adminNotes ?? "")

  const expiresAt = useMemo(() => {
    if (preset === "never") return null
    if (preset === "custom") return custom ?? null
    // eslint-disable-next-line react-hooks/purity
    return new Date(Date.now() + Number(preset) * DAY)
  }, [preset, custom])

  const save = () =>
    start(async () => {
      if (preset === "custom" && !custom) return void toast.error("Pick an expiry date")
      const res = await assignPlan({ userId: user.id, planId, expiresAt: expiresAt ? expiresAt.toISOString() : null, adminNotes: notes })
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Assigned ${plans.find((p) => p.id === planId)?.name} to ${user.email}`)
      onClose()
      router.refresh()
    })
  const revoke = () =>
    start(async () => {
      const res = await revokeSubscription(user.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Subscription revoked — user is back on Free")
      onClose()
      router.refresh()
    })

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Assign plan</SheetTitle>
          <SheetDescription>
            {user.name ? `${user.name} · ` : ""}
            {user.email}
          </SheetDescription>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="secondary">Now: {user.effectivePlanName}</Badge>
            {user.sub?.status === "EXPIRED" || (user.sub && !user.sub.effective) ? <Badge variant="outline">Previous sub expired</Badge> : null}
            {user.sub?.assignedBy && <Badge variant="outline" className="font-normal">by {user.sub.assignedBy}</Badge>}
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel>Plan</FieldLabel>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="text-muted-foreground">· {p.priceLabel}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Access period</FieldLabel>
              <ToggleGroup type="single" variant="outline" size="sm" value={preset} onValueChange={(v) => v && setPreset(v as Preset)} className="w-full">
                <ToggleGroupItem value="30" className="flex-1">30d</ToggleGroupItem>
                <ToggleGroupItem value="90" className="flex-1">90d</ToggleGroupItem>
                <ToggleGroupItem value="365" className="flex-1">1y</ToggleGroupItem>
                <ToggleGroupItem value="never" className="flex-1">No expiry</ToggleGroupItem>
                <ToggleGroupItem value="custom" className="flex-1">Custom</ToggleGroupItem>
              </ToggleGroup>
              {preset === "custom" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start font-normal", !custom && "text-muted-foreground")}>
                      <CalendarIcon /> {custom ? formatDate(custom) : "Pick an expiry date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={custom} onSelect={setCustom} disabled={{ before: tomorrow() }} />
                  </PopoverContent>
                </Popover>
              )}
              <FieldDescription>
                {expiresAt ? `Expires ${formatDate(expiresAt)} — the account falls back to Free afterwards.` : "Stays active until changed or revoked."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-notes">Admin notes</FieldLabel>
              <Textarea id="admin-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Invoice #, payment method, special terms…" maxLength={2000} />
              <FieldDescription>Only visible to admins.</FieldDescription>
            </Field>
          </FieldGroup>
        </div>
        <SheetFooter className="border-t">
          <Button onClick={save} disabled={pending || !planId}>
            {pending && <Spinner />} Save assignment
          </Button>
          {user.sub && user.sub.effective && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={pending || user.id === selfId}>
                  Revoke subscription
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke {user.sub.planName}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {user.email} immediately falls back to Free limits. Existing forms and responses are kept, but paid features switch off.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={revoke}>
                    Revoke
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

type Segment = "all" | "paid" | "free" | "expiring" | "expired" | "admins"
type SortKey = "joined" | "name" | "forms" | "responses" | "expires"

const SOON = 14 * DAY

function usagePct(used: number, max: number) {
  if (max < 0) return 0
  if (max === 0) return 100
  return Math.min(100, Math.round((used / max) * 100))
}

function UsageCell({ used, max }: { used: number; max: number }) {
  const pct = usagePct(used, max)
  const hot = max >= 0 && pct >= 90
  return (
    <div className="ml-auto flex w-32 flex-col items-end gap-1">
      <span className={cn("font-mono text-xs tabular-nums", hot && "font-medium text-warm-foreground")}>
        {used.toLocaleString()} <span className="text-muted-foreground">/ {formatLimit(max)}</span>
      </span>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        {max >= 0 ? (
          <div className={cn("h-full rounded-full", hot ? "bg-warm" : "bg-primary/70")} style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full w-full bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_7px)]" />
        )}
      </div>
    </div>
  )
}

function SortHead({ label, k, sort, setSort, className }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; setSort: (s: { key: SortKey; dir: 1 | -1 }) => void; className?: string }) {
  const active = sort.key === k
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <Button
        variant="ghost"
        size="sm"
        className={cn("-mx-2 h-7 gap-1 px-2 text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}
        onClick={() => setSort({ key: k, dir: active ? ((sort.dir * -1) as 1 | -1) : k === "name" || k === "expires" ? 1 : -1 })}
      >
        {label}
        {active ? sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : <ArrowUpDownIcon className="size-3 opacity-50" />}
      </Button>
    </TableHead>
  )
}

function csvCell(v: string | number) {
  const s = String(v)
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

export function UsersTable({ users, plans, selfId, initialQuery = "" }: { users: AdminUserRow[]; plans: PlanOption[]; selfId: string; initialQuery?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [query, setQuery] = useState(initialQuery)
  const [planFilter, setPlanFilter] = useState("all")
  const [segment, setSegment] = useState<Segment>("all")
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "joined", dir: -1 })
  const [editing, setEditing] = useState<AdminUserRow | null>(null)
  // Reference time for "expiring soon"; fixed per mount so renders stay pure.
  const [now] = useState(() => new Date().getTime())

  const inSegment = (u: AdminUserRow, seg: Segment) => {
    switch (seg) {
      case "paid":
        return !!u.sub?.effective && u.effectivePlanName !== "Free"
      case "free":
        return !(u.sub?.effective && u.effectivePlanName !== "Free")
      case "expiring":
        return !!u.sub?.effective && !!u.sub.expiresAt && new Date(u.sub.expiresAt).getTime() - now < SOON
      case "expired":
        return !!u.sub && !u.sub.effective
      case "admins":
        return u.role === "ADMIN"
      default:
        return true
    }
  }
  const segments: { id: Segment; label: string }[] = [
    { id: "all", label: "All" },
    { id: "paid", label: "Paid" },
    { id: "free", label: "Free" },
    { id: "expiring", label: "Expiring soon" },
    { id: "expired", label: "Expired" },
    { id: "admins", label: "Admins" },
  ]
  const counts = Object.fromEntries(segments.map((sg) => [sg.id, users.filter((u) => inSegment(u, sg.id)).length])) as Record<Segment, number>

  const q = query.trim().toLowerCase()
  const shown = users
    .filter((u) => inSegment(u, segment))
    .filter((u) => planFilter === "all" || u.effectivePlanName === planFilter)
    .filter((u) => !q || `${u.name ?? ""} ${u.email}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const d = sort.dir
      switch (sort.key) {
        case "name":
          return d * (a.name ?? a.email).localeCompare(b.name ?? b.email)
        case "forms":
          return d * (a.forms - b.forms)
        case "responses":
          return d * (a.monthlySubmissions - b.monthlySubmissions)
        case "expires": {
          const ea = a.sub?.effective && a.sub.expiresAt ? new Date(a.sub.expiresAt).getTime() : Infinity
          const eb = b.sub?.effective && b.sub.expiresAt ? new Date(b.sub.expiresAt).getTime() : Infinity
          return ea === eb ? 0 : d * (ea < eb ? -1 : 1)
        }
        default:
          return d * a.createdAt.localeCompare(b.createdAt)
      }
    })

  const toggleRole = (u: AdminUserRow) =>
    start(async () => {
      const res = await setUserRole(u.id, u.role === "ADMIN" ? "USER" : "ADMIN")
      if (!res.ok) return void toast.error(res.error)
      toast.success(u.role === "ADMIN" ? `${u.email} is no longer an admin` : `${u.email} is now an admin`)
      router.refresh()
    })

  const exportCsv = () => {
    const header = ["Name", "Email", "Role", "Plan", "Expires", "Forms", "Form limit", "Responses this month", "Response limit", "Joined"]
    const lines = shown.map((u) =>
      [
        u.name ?? "",
        u.email,
        u.role,
        u.effectivePlanName,
        u.sub?.effective && u.sub.expiresAt ? u.sub.expiresAt.slice(0, 10) : "",
        u.forms,
        u.limits.maxForms < 0 ? "unlimited" : u.limits.maxForms,
        u.monthlySubmissions,
        u.limits.monthlySubmissions < 0 ? "unlimited" : u.limits.monthlySubmissions,
        u.createdAt.slice(0, 10),
      ]
        .map(csvCell)
        .join(",")
    )
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `digital-fueled-users-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${shown.length} user${shown.length === 1 ? "" : "s"}`)
  }

  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={segment}
        onValueChange={(v) => v && setSegment(v as Segment)}
        className="flex-wrap"
        aria-label="Filter users"
      >
        {segments.map((sg) => (
          <ToggleGroupItem key={sg.id} value={sg.id} className="gap-1.5 px-3 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
            {sg.label}
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{counts[sg.id]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-8 w-full sm:w-72">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search users" />
        </InputGroup>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger size="sm" className="w-40" aria-label="Filter by plan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.name}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {shown.length} of {users.length}
        </span>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={shown.length === 0}>
          <DownloadIcon /> Export CSV
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <SortHead label="User" k="name" sort={sort} setSort={setSort} className="pl-4" />
              <TableHead className="text-xs">Plan</TableHead>
              <SortHead label="Renews / expires" k="expires" sort={sort} setSort={setSort} />
              <SortHead label="Forms" k="forms" sort={sort} setSort={setSort} className="text-right [&>button]:ml-auto [&>button]:flex" />
              <SortHead label="Responses / mo" k="responses" sort={sort} setSort={setSort} className="text-right [&>button]:ml-auto [&>button]:flex" />
              <SortHead label="Joined" k="joined" sort={sort} setSort={setSort} />
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((u) => {
              const soon = !!u.sub?.effective && !!u.sub.expiresAt && new Date(u.sub.expiresAt).getTime() - now < SOON
              return (
                <TableRow
                  key={u.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => setEditing(u)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target === e.currentTarget) setEditing(u)
                  }}
                  aria-label={`Manage ${u.email}`}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-8 rounded-md">
                        <AvatarFallback className="rounded-md bg-accent text-[11px] font-medium text-accent-foreground">{initials(u.name, u.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {u.name ?? "—"}
                          {u.role === "ADMIN" && (
                            <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[10px]">
                              <ShieldIcon className="size-2.5" /> Admin
                            </Badge>
                          )}
                          {u.id === selfId && <span className="text-[10px] font-normal text-muted-foreground">(you)</span>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={u.effectivePlanName === "Free" ? "outline" : "secondary"} className="gap-1.5">
                        <span className={cn("size-1.5 rounded-full", u.effectivePlanName === "Free" ? "bg-muted-foreground/50" : "bg-primary")} />
                        {u.effectivePlanName}
                      </Badge>
                      {u.sub && !u.sub.effective && (
                        <Badge variant="outline" className="border-destructive/30 text-destructive">
                          {u.sub.planName} expired
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.sub?.effective ? (
                      u.sub.expiresAt ? (
                        <span className={cn("tabular-nums", soon ? "font-medium text-warm-foreground" : "text-muted-foreground")}>
                          {soon && <ClockIcon className="mr-1 inline size-3.5 align-[-2px] text-warm" />}
                          {formatDate(u.sub.expiresAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No expiry</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <UsageCell used={u.forms} max={u.limits.maxForms} />
                  </TableCell>
                  <TableCell className="text-right">
                    <UsageCell used={u.monthlySubmissions} max={u.limits.monthlySubmissions} />
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{timeAgo(u.createdAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${u.email}`}>
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(u)}>
                          <UserCogIcon /> Assign plan…
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            void navigator.clipboard.writeText(u.email).then(() => toast.success("Email copied"))
                          }}
                        >
                          <CopyIcon /> Copy email
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => toggleRole(u)} disabled={pending || u.id === selfId}>
                          {u.role === "ADMIN" ? <ShieldOffIcon /> : <ShieldIcon />}
                          {u.role === "ADMIN" ? "Remove admin" : "Make admin"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {shown.length === 0 && (
          <Empty className="rounded-none border-t">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>No users found</EmptyTitle>
              <EmptyDescription>Try a different search, segment or plan filter.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      {editing && <AssignSheet key={editing.id} user={editing} plans={plans} selfId={selfId} onClose={() => setEditing(null)} />}
    </div>
  )
}
