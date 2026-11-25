"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  CheckCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Columns3Icon,
  DownloadIcon,
  FlagIcon,
  InboxIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"

import { deleteSubmissions, setSubmissionStatus } from "@/app/actions/submissions"
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
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatValue, type FieldValue, type FormField } from "@/lib/form-engine"
import { formatDate, formatDateTime, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

import { SubmissionSheet } from "./submission-sheet"

export type SubmissionStatus = "NEW" | "REVIEWED" | "FLAGGED" | "ARCHIVED"

export interface SubmissionRow {
  id: string
  createdAt: string
  status: SubmissionStatus
  score: number | null
  notes: string | null
  data: Record<string, FieldValue>
  metadata: Record<string, unknown>
}

export const STATUS_META: Record<SubmissionStatus, { label: string; className: string }> = {
  NEW: { label: "New", className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  REVIEWED: { label: "Reviewed", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  FLAGGED: { label: "Flagged", className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  ARCHIVED: { label: "Archived", className: "text-muted-foreground" },
}

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const m = STATUS_META[status]
  return (
    <Badge variant="outline" className={cn("font-normal", m.className)}>
      {m.label}
    </Badge>
  )
}

const features = tableFeatures({
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime, basic: sortFn_basic },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})
const helper = createColumnHelper<typeof features, SubmissionRow>()

const RANGES: Record<string, number | null> = { all: null, "1": 1, "7": 7, "30": 30, "90": 90 }

export function SubmissionsTable({
  formId,
  fields,
  rows,
  showScore,
  maxScore,
  canReview = true,
  canDelete = true,
}: {
  formId: string
  fields: FormField[]
  rows: SubmissionRow[]
  showScore: boolean
  maxScore: number
  /** UI gating only — the server actions re-check the caller's form access. */
  canReview?: boolean
  canDelete?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | SubmissionStatus>("all")
  const [rangePreset, setRangePreset] = useState("all")
  const [customRange, setCustomRange] = useState<DateRange | undefined>()
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => fields.filter((f) => f.type !== "hidden").slice(0, 4).map((f) => f.key))
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 })
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields])

  const { fromDate, toDate } = useMemo(() => {
    if (customRange?.from) {
      const to = new Date(customRange.to ?? customRange.from)
      to.setHours(23, 59, 59, 999)
      const from = new Date(customRange.from)
      from.setHours(0, 0, 0, 0)
      return { fromDate: from, toDate: to }
    }
    const days = RANGES[rangePreset]
    // eslint-disable-next-line react-hooks/purity
    return { fromDate: days ? new Date(Date.now() - days * 86400000) : null, toDate: null as Date | null }
  }, [customRange, rangePreset])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false
      const t = new Date(r.createdAt).getTime()
      if (fromDate && t < fromDate.getTime()) return false
      if (toDate && t > toDate.getTime()) return false
      if (q) {
        const hay = `${r.id} ${r.notes ?? ""} ${Object.values(r.data)
          .map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "")))
          .join(" ")}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, query, status, fromDate, toDate])

  const columns = useMemo(() => {
    const cols: ColumnDef<typeof features, SubmissionRow, any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
      helper.display({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
      }),
      helper.accessor("createdAt", {
        header: "Submitted",
        sortFn: "text",
        cell: (info) => (
          <div className="whitespace-nowrap">
            <div className="text-sm">{formatDateTime(info.getValue())}</div>
            <div className="text-xs text-muted-foreground">{timeAgo(info.getValue())}</div>
          </div>
        ),
      }),
      helper.accessor("status", {
        header: "Status",
        sortFn: "text",
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
    ]
    if (showScore)
      cols.push(
        helper.accessor((r) => r.score ?? -1, {
          id: "score",
          header: "Score",
          sortFn: "basic",
          cell: (info) => (info.row.original.score === null ? "—" : <span className="tabular-nums">{info.row.original.score}<span className="text-muted-foreground"> / {maxScore}</span></span>),
        })
      )
    for (const key of visibleKeys) {
      const field = fieldByKey.get(key)
      cols.push(
        helper.accessor((r) => (field ? formatValue(field, r.data[key]) : String(r.data[key] ?? "")), {
          id: `f:${key}`,
          header: field?.label ?? key,
          sortFn: "alphanumeric",
          cell: (info) => <div className="max-w-[16rem] truncate text-sm">{info.getValue() || <span className="text-muted-foreground">—</span>}</div>,
        })
      )
    }
    return cols
  }, [visibleKeys, fieldByKey, showScore, maxScore])

  const table = useTable({
    features,
    columns,
    data: filtered,
    getRowId: (r) => r.id,
    state: { sorting, pagination, rowSelection },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
  })

  const selectedIds = Object.keys(rowSelection).filter((id) => filtered.some((r) => r.id === id))
  const pageCount = Math.max(1, Math.ceil(filtered.length / pagination.pageSize))

  const bulkStatus = (next: SubmissionStatus) =>
    start(async () => {
      const res = await setSubmissionStatus(formId, selectedIds, next)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`${res.data.count} marked ${STATUS_META[next].label.toLowerCase()}`)
      setRowSelection({})
      router.refresh()
    })

  const bulkDelete = () =>
    start(async () => {
      const res = await deleteSubmissions(formId, selectedIds)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Deleted ${res.data.count} responses`)
      setRowSelection({})
      setConfirmDelete(false)
      router.refresh()
    })

  const exportUrl = (format: "csv" | "json", onlySelected = false) => {
    const p = new URLSearchParams({ format })
    if (onlySelected && selectedIds.length) p.set("ids", selectedIds.join(","))
    else {
      if (status !== "all") p.set("status", status)
      if (fromDate) p.set("from", fromDate.toISOString())
      if (toDate) p.set("to", toDate.toISOString())
      if (query.trim()) p.set("q", query.trim())
    }
    return `/api/forms/${formId}/export?${p.toString()}`
  }

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }))
  const openIndex = filtered.findIndex((r) => r.id === openId)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-8 w-full sm:w-64">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search answers & notes"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              resetPage()
            }}
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" onClick={() => setQuery("")} aria-label="Clear search">
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as typeof status)
            resetPage()
          }}
        >
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_META) as SubmissionStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={customRange?.from ? "custom" : rangePreset}
          onValueChange={(v) => {
            if (v === "custom") return
            setCustomRange(undefined)
            setRangePreset(v)
            resetPage()
          }}
        >
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="1">Last 24 hours</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            {customRange?.from && <SelectItem value="custom">Custom range</SelectItem>}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn(customRange?.from && "border-foreground/40")}>
              <CalendarIcon />
              {customRange?.from
                ? `${formatDate(customRange.from, { month: "short", day: "numeric" })} – ${formatDate(customRange.to ?? customRange.from, { month: "short", day: "numeric" })}`
                : "Dates"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={customRange}
              onSelect={(r) => {
                setCustomRange(r)
                resetPage()
              }}
              disabled={{ after: new Date() }}
            />
            {customRange?.from && (
              <div className="border-t p-2 text-right">
                <Button variant="ghost" size="sm" onClick={() => setCustomRange(undefined)}>
                  Clear dates
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3Icon /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Answer columns</DropdownMenuLabel>
              {fields.map((f) => (
                <DropdownMenuCheckboxItem
                  key={f.key}
                  checked={visibleKeys.includes(f.key)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) =>
                    setVisibleKeys((ks) => (on ? fields.map((x) => x.key).filter((k) => k === f.key || ks.includes(k)) : ks.filter((k) => k !== f.key)))
                  }
                >
                  <span className="truncate">{f.label}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <DownloadIcon /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">{filtered.length} filtered responses</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a href={exportUrl("csv")} download>
                  CSV (spreadsheet)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={exportUrl("json")} download>
                  JSON (with metadata)
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">{selectedIds.length} selected</span>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setRowSelection({})}>
            Clear
          </Button>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {canReview && (
              <>
                <Button variant="outline" size="sm" className="h-7" disabled={pending} onClick={() => bulkStatus("REVIEWED")}>
                  <CheckCheckIcon /> Reviewed
                </Button>
                <Button variant="outline" size="sm" className="h-7" disabled={pending} onClick={() => bulkStatus("FLAGGED")}>
                  <FlagIcon /> Flag
                </Button>
                <Button variant="outline" size="sm" className="h-7" disabled={pending} onClick={() => bulkStatus("ARCHIVED")}>
                  <ArchiveIcon /> Archive
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" className="h-7" asChild>
              <a href={exportUrl("csv", true)} download>
                <DownloadIcon /> CSV
              </a>
            </Button>
            {canDelete && (
              <Button variant="outline" size="sm" className="h-7 text-destructive hover:text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
                <Trash2Icon /> Delete
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const sortable = header.column.getCanSort()
                  const dir = header.column.getIsSorted()
                  return (
                    <TableHead key={header.id} className={cn(header.id === "select" && "w-10")}>
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          className="-ml-1 flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          {dir === "asc" ? <ArrowUpIcon className="size-3" /> : dir === "desc" ? <ArrowDownIcon className="size-3" /> : <ArrowUpDownIcon className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className={cn("cursor-pointer", row.original.status === "NEW" && "font-medium")}
                onClick={() => setOpenId(row.id)}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} onClick={cell.column.id === "select" ? (e) => e.stopPropagation() : undefined}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <Empty className="rounded-none border-t">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>{rows.length === 0 ? "No responses yet" : "No matching responses"}</EmptyTitle>
              <EmptyDescription>
                {rows.length === 0 ? "Share your form to start collecting responses." : "Try a different search, status or date range."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {filtered.length} {filtered.length === 1 ? "response" : "responses"}
          {filtered.length !== rows.length && ` of ${rows.length}`}
        </span>
        <div className="flex items-center gap-2">
          <Select value={String(pagination.pageSize)} onValueChange={(v) => setPagination({ pageIndex: 0, pageSize: Number(v) })}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="tabular-nums">
            Page {Math.min(pagination.pageIndex + 1, pageCount)} of {pageCount}
          </span>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <SubmissionSheet
        formId={formId}
        fields={fields}
        submission={openIndex >= 0 ? filtered[openIndex] : null}
        showScore={showScore}
        maxScore={maxScore}
        canReview={canReview}
        canDelete={canDelete}
        onClose={() => setOpenId(null)}
        onPrev={openIndex > 0 ? () => setOpenId(filtered[openIndex - 1].id) : undefined}
        onNext={openIndex >= 0 && openIndex < filtered.length - 1 ? () => setOpenId(filtered[openIndex + 1].id) : undefined}
        position={openIndex >= 0 ? `${openIndex + 1} of ${filtered.length}` : ""}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} responses?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the selected responses and their files. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                bulkDelete()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
