"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, FileIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { deleteSubmissions, setSubmissionStatus, updateSubmissionNotes } from "@/app/actions/submissions"
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
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { formatValue, isEmptyValue, isFileValue, type FieldValue, type FormField } from "@/lib/form-engine"
import { formatDateTime, formatDuration } from "@/lib/format"

import { STATUS_META, type SubmissionRow, type SubmissionStatus } from "./submissions-table"

function Answer({ field, value }: { field: FormField | undefined; value: FieldValue }) {
  if (isEmptyValue(value)) return <span className="text-muted-foreground">No answer</span>
  if (isFileValue(value)) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-2">
        {value.type.startsWith("image/") && value.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.dataUrl} alt={value.name} className="size-12 rounded object-cover" />
        ) : (
          <FileIcon className="size-5 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{value.name}</div>
          <div className="text-xs text-muted-foreground">{(value.size / 1024).toFixed(0)} KB · {value.type || "file"}</div>
        </div>
        {value.dataUrl && (
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <a href={value.dataUrl} download={value.name} aria-label="Download file">
              <DownloadIcon />
            </a>
          </Button>
        )}
      </div>
    )
  }
  if (field?.type === "signature" && typeof value === "string" && value.startsWith("data:")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={value} alt="Signature" className="h-20 w-auto rounded-md border bg-white p-1" />
  }
  if (field?.type === "matrix" && value && typeof value === "object" && !Array.isArray(value)) {
    const rows = field.props?.matrixRows ?? []
    const cols = field.props?.matrixColumns ?? []
    const v = value as Record<string, string>
    return (
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.id} className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span>{cols.find((c) => c.id === v[r.id])?.label ?? "—"}</span>
          </div>
        ))}
      </div>
    )
  }
  if (Array.isArray(value) && field?.options) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((x) => (
          <span key={x} className="rounded-md bg-muted px-2 py-0.5 text-sm">
            {field.options?.find((o) => o.value === x)?.label ?? x}
          </span>
        ))}
      </div>
    )
  }
  if (!field) return <span className="text-sm break-words">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
  return <span className="text-sm break-words whitespace-pre-wrap">{formatValue(field, value)}</span>
}

export function SubmissionSheet({
  formId,
  fields,
  submission,
  showScore,
  maxScore,
  canReview = true,
  canDelete = true,
  onClose,
  onPrev,
  onNext,
  position,
}: {
  formId: string
  fields: FormField[]
  submission: SubmissionRow | null
  showScore: boolean
  maxScore: number
  canReview?: boolean
  canDelete?: boolean
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  position: string
}) {
  const router = useRouter()
  const [notes, setNotes] = useState(submission?.notes ?? "")
  const [status, setStatus] = useState<SubmissionStatus>(submission?.status ?? "NEW")
  const [pending, start] = useTransition()

  const syncKey = `${submission?.id}|${submission?.notes ?? ""}|${submission?.status}`
  const [prevKey, setPrevKey] = useState(syncKey)
  if (prevKey !== syncKey) {
    setPrevKey(syncKey)
    setNotes(submission?.notes ?? "")
    setStatus(submission?.status ?? "NEW")
  }

  // Opening a NEW response marks it reviewed automatically.
  useEffect(() => {
    if (!submission || submission.status !== "NEW" || !canReview) return
    const id = submission.id
    const t = setTimeout(() => {
      void setSubmissionStatus(formId, [id], "REVIEWED").then((res) => {
        if (res.ok) {
          setStatus("REVIEWED")
          router.refresh()
        }
      })
    }, 1200)
    return () => clearTimeout(t)
  }, [submission, formId, router, canReview])

  if (!submission) return <Sheet open={false} onOpenChange={() => onClose()} />

  const meta = submission.metadata as {
    device?: string
    browser?: string
    os?: string
    referrer?: string
    url?: string
    utm?: Record<string, string>
    completionSeconds?: number | null
    embedType?: string
  }
  const known = new Set(fields.map((f) => f.key))
  const extra = Object.keys(submission.data).filter((k) => !known.has(k))

  const changeStatus = (next: SubmissionStatus) =>
    start(async () => {
      setStatus(next)
      const res = await setSubmissionStatus(formId, [submission.id], next)
      if (!res.ok) return void toast.error(res.error)
      router.refresh()
    })
  const saveNotes = () =>
    start(async () => {
      const res = await updateSubmissionNotes(submission.id, notes)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Notes saved")
      router.refresh()
    })
  const remove = () =>
    start(async () => {
      const res = await deleteSubmissions(formId, [submission.id])
      if (!res.ok) return void toast.error(res.error)
      toast.success("Response deleted")
      onClose()
      router.refresh()
    })

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-base">Response</SheetTitle>
            <span className="font-mono text-xs text-muted-foreground">#{submission.id.slice(-8).toUpperCase()}</span>
          </div>
          <SheetDescription>
            {formatDateTime(submission.createdAt)} · {position}
          </SheetDescription>
          <div className="flex items-center gap-2 pt-2">
            <Select value={status} onValueChange={(v) => changeStatus(v as SubmissionStatus)} disabled={!canReview}>
              <SelectTrigger size="sm" className="w-36" aria-label="Response status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_META) as SubmissionStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showScore && submission.score !== null && (
              <span className="rounded-md bg-muted px-2 py-1 text-sm tabular-nums">
                Score {submission.score} / {maxScore}
              </span>
            )}
            <div className="ml-auto flex gap-1">
              <Button variant="outline" size="icon" className="size-8" onClick={onPrev} disabled={!onPrev} aria-label="Previous response">
                <ChevronLeftIcon />
              </Button>
              <Button variant="outline" size="icon" className="size-8" onClick={onNext} disabled={!onNext} aria-label="Next response">
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="answers" className="min-h-0 flex-1 gap-0">
          <TabsList variant="line" className="w-full justify-start border-b px-4">
            <TabsTrigger value="answers">Answers</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="notes">Notes{submission.notes ? " •" : ""}</TabsTrigger>
          </TabsList>
          <ScrollArea className="min-h-0 flex-1">
            <TabsContent value="answers" className="space-y-4 p-4">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{f.label}</div>
                  <Answer field={f} value={submission.data[f.key]} />
                </div>
              ))}
              {extra.length > 0 && (
                <>
                  <Separator />
                  <div className="text-xs text-muted-foreground">Fields from earlier versions</div>
                  {extra.map((k) => (
                    <div key={k} className="space-y-1">
                      <div className="font-mono text-xs text-muted-foreground">{k}</div>
                      <Answer field={undefined} value={submission.data[k]} />
                    </div>
                  ))}
                </>
              )}
            </TabsContent>
            <TabsContent value="details" className="p-4">
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">Channel</dt>
                <dd className="capitalize">{(meta.embedType ?? "direct").toLowerCase()}</dd>
                <dt className="text-muted-foreground">Device</dt>
                <dd className="capitalize">{[meta.device, meta.browser, meta.os].filter(Boolean).join(" · ") || "—"}</dd>
                <dt className="text-muted-foreground">Time to complete</dt>
                <dd>{formatDuration(meta.completionSeconds ?? 0)}</dd>
                <dt className="text-muted-foreground">Referrer</dt>
                <dd className="break-all">{meta.referrer || "—"}</dd>
                <dt className="text-muted-foreground">Page URL</dt>
                <dd className="break-all">{meta.url || "—"}</dd>
                {Object.entries(meta.utm ?? {}).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
                <dt className="text-muted-foreground">Submission ID</dt>
                <dd className="font-mono text-xs break-all">{submission.id}</dd>
              </dl>
            </TabsContent>
            <TabsContent value="notes" className="space-y-3 p-4">
              <Textarea rows={8} placeholder="Private notes for your team — never shown to the respondent." value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} readOnly={!canReview} />
              {canReview ? (
                <div className="flex justify-end">
                  <Button size="sm" onClick={saveNotes} disabled={pending || notes === (submission.notes ?? "")}>
                    Save notes
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">You have view access — ask a form manager for Review access to edit notes and status.</p>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {canDelete && (
        <SheetFooter className="border-t">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="justify-start text-destructive hover:text-destructive">
                <Trash2Icon /> Delete response
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this response?</AlertDialogTitle>
                <AlertDialogDescription>It will be permanently removed, including any uploaded files.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={remove}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
