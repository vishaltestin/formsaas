"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { HistoryIcon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { listVersions, restoreVersion } from "@/app/actions/forms"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { FormSchema, ThemeConfig } from "@/lib/form-engine"
import { formatDate, timeAgo } from "@/lib/format"

type Version = Awaited<ReturnType<typeof listVersions>>[number]

export function VersionsSheet({
  formId,
  onRestored,
  publishCount,
}: {
  formId: string
  onRestored: (data: { schema: FormSchema; theme: ThemeConfig }) => void
  /** changes whenever a publish happens so the list refreshes */
  publishCount: number
}) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [confirm, setConfirm] = useState<Version | null>(null)
  const [pending, start] = useTransition()

  const load = useCallback(() => {
    listVersions(formId)
      .then(setVersions)
      .catch(() => {
        setVersions([])
        toast.error("Could not load versions")
      })
  }, [formId])

  useEffect(() => {
    if (open) load()
  }, [open, load, publishCount])

  const restore = (v: Version) =>
    start(async () => {
      const res = await restoreVersion(formId, v.id)
      if (!res.ok) return void toast.error(res.error)
      onRestored(res.data)
      setConfirm(null)
      setOpen(false)
      toast.success(`Restored version ${v.versionNumber} into your draft`, { description: "Publish to make it live." })
    })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Version history">
              <HistoryIcon />
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>Version history</TooltipContent>
      </Tooltip>
      <SheetContent className="w-full gap-0 sm:max-w-sm">
        <SheetHeader className="border-b">
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>A snapshot is saved every time you publish. Restoring loads it into your draft.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-4">
            {versions === null &&
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            {versions?.length === 0 && (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HistoryIcon />
                  </EmptyMedia>
                  <EmptyTitle>No versions yet</EmptyTitle>
                  <EmptyDescription>Publish your form to create the first snapshot.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {versions?.map((v, i) => (
              <div key={v.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-sm font-medium tabular-nums">
                  v{v.versionNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {formatDate(v.createdAt)}
                    {i === 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        Live
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {timeAgo(v.createdAt)} · {v.fieldCount} questions
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setConfirm(v)} disabled={pending}>
                  <RotateCcwIcon /> Restore
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version {confirm?.versionNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current draft fields, logic and theme will be replaced. The live form stays unchanged until you publish again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                if (confirm) restore(confirm)
              }}
            >
              {pending ? "Restoring…" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
