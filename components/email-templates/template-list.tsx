"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronDownIcon,
  CodeXmlIcon,
  CopyIcon,
  LockIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  createEmailTemplateFromStarter,
  deleteEmailTemplate,
  duplicateEmailTemplate,
} from "@/app/actions/email-templates"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"

export interface TemplateSummary {
  id: string
  name: string
  description: string
  subject: string
  updatedAt: string
  sizeKb: number
  usedBy: string[]
}

export function TemplateList({
  workspaceId,
  templates,
  starters,
  canManage,
  allowed,
}: {
  workspaceId: string
  templates: TemplateSummary[]
  starters: { id: string; name: string; description: string }[]
  canManage: boolean
  allowed: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState<TemplateSummary | null>(
    null
  )
  const editable = canManage && allowed

  function create(starterId: string) {
    start(async () => {
      const res = await createEmailTemplateFromStarter(workspaceId, starterId)
      if (!res.ok) return void toast.error(res.error)
      router.push(`/dashboard/settings/email-templates/${res.data.id}`)
    })
  }

  function duplicate(t: TemplateSummary) {
    start(async () => {
      const res = await duplicateEmailTemplate(workspaceId, t.id)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Duplicated “${t.name}”`)
      router.refresh()
    })
  }

  function remove(t: TemplateSummary) {
    start(async () => {
      const res = await deleteEmailTemplate(workspaceId, t.id)
      setConfirmDelete(null)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Deleted “${t.name}”`)
      router.refresh()
    })
  }

  return (
    <section className="space-y-4" aria-labelledby="templates-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="templates-title" className="text-base font-semibold">
            Email templates
          </h2>
          <p className="text-sm text-muted-foreground">
            Paste or write your own HTML and CSS, add your images, and use merge
            tags like <code className="text-xs">{"{{first_name}}"}</code>. Pick
            a template per form under Build → Settings.
          </p>
        </div>
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={pending} data-testid="new-template">
                {pending ? <Spinner /> : <PlusIcon />} New template{" "}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Start from</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {starters.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onSelect={() => create(s.id)}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!allowed && (
        <Alert>
          <LockIcon />
          <AlertTitle>Custom HTML emails are a Pro feature</AlertTitle>
          <AlertDescription>
            Upgrade the workspace owner&rsquo;s plan to Pro or Enterprise to
            design emails with your own HTML, styles and images. Until then
            every email uses the built-in design.
          </AlertDescription>
        </Alert>
      )}
      {allowed && !canManage && (
        <p className="text-sm text-muted-foreground">
          You can view templates. Editors, Admins and the Owner can create and
          change them.
        </p>
      )}

      {templates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
          <CodeXmlIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">No custom templates yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Every email currently uses the built-in Digital Fueled design.
            Create a template to send emails that look like your brand.
          </p>
          {editable && (
            <Button
              className="mt-2"
              variant="outline"
              disabled={pending}
              onClick={() => create("branded")}
            >
              <PlusIcon /> Start with the branded starter
            </Button>
          )}
        </div>
      ) : (
        <ul
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="template-list"
        >
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex flex-col rounded-lg border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <MailIcon className="size-4" />
                  </span>
                  <Link
                    href={`/dashboard/settings/email-templates/${t.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
                </div>
                {editable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label={`Actions for ${t.name}`}
                      >
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/dashboard/settings/email-templates/${t.id}`}
                        >
                          <PencilIcon /> Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => duplicate(t)}>
                        <CopyIcon /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setConfirmDelete(t)}
                      >
                        <Trash2Icon /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {t.description && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {t.description}
                </p>
              )}
              <p
                className="mt-2 truncate text-xs text-muted-foreground"
                title={t.subject}
              >
                Subject: {t.subject || <em>uses each form&rsquo;s subject</em>}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                {t.usedBy.length > 0 ? (
                  <Badge variant="secondary" title={t.usedBy.join("\n")}>
                    Used in {t.usedBy.length}{" "}
                    {t.usedBy.length === 1 ? "place" : "places"}
                  </Badge>
                ) : (
                  <Badge variant="outline">Not used yet</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {t.sizeKb} KB · edited {t.updatedAt}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && confirmDelete.usedBy.length > 0
                ? `It's used by ${confirmDelete.usedBy.join(", ")}. Those emails will switch back to the built-in design.`
                : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={pending}
              onClick={() => confirmDelete && remove(confirmDelete)}
            >
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
