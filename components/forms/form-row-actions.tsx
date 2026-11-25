"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  BarChart3Icon,
  CopyIcon,
  ExternalLinkIcon,
  InboxIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { deleteForm, duplicateForm } from "@/app/actions/forms"
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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function FormRowActions({
  formId,
  slug,
  title,
  published,
  can = { edit: true, share: true, duplicate: true, delete: true, access: true },
}: {
  formId: string
  slug: string
  title: string
  published: boolean
  /** UI gating from the caller's effective form level; every action is re-checked server-side. */
  can?: { edit: boolean; share: boolean; duplicate: boolean; delete: boolean; access: boolean }
}) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()

  const duplicate = () =>
    start(async () => {
      const res = await duplicateForm(formId)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Form duplicated")
      router.push(`/dashboard/forms/${res.data.id}/edit`)
    })

  const remove = () =>
    start(async () => {
      const res = await deleteForm(formId)
      if (!res.ok) return void toast.error(res.error)
      toast.success("Form deleted")
      setConfirm(false)
      router.refresh()
    })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Form actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {can.edit && (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/forms/${formId}/edit`}>
                <PencilIcon /> Edit
              </Link>
            </DropdownMenuItem>
          )}
          {can.share && (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/forms/${formId}/share`}>
                <Share2Icon /> Share & embed
              </Link>
            </DropdownMenuItem>
          )}
          {can.access && (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/forms/${formId}/access`}>
                <KeyRoundIcon /> People & access
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/forms/${formId}/submissions`}>
              <InboxIcon /> Submissions
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/forms/${formId}/analytics`}>
              <BarChart3Icon /> Analytics
            </Link>
          </DropdownMenuItem>
          {published && (
            <DropdownMenuItem asChild>
              <a href={`/f/${slug}`} target="_blank" rel="noreferrer">
                <ExternalLinkIcon /> Open live form
              </a>
            </DropdownMenuItem>
          )}
          {(can.duplicate || can.delete) && <DropdownMenuSeparator />}
          {can.duplicate && (
            <DropdownMenuItem onSelect={duplicate} disabled={pending}>
              <CopyIcon /> Duplicate
            </DropdownMenuItem>
          )}
          {can.delete && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
              <Trash2Icon /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the form, all versions, submissions, analytics events and webhooks. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                remove()
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
