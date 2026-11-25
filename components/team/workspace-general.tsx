"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { LogOutIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { createWorkspace, deleteWorkspace, leaveWorkspace, renameWorkspace } from "@/app/actions/workspaces"
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function WorkspaceGeneral({
  workspaceId,
  name,
  roleLabel,
  owner,
  forms,
  members,
  can,
  onlyWorkspace,
}: {
  workspaceId: string
  name: string
  roleLabel: string
  owner: string
  forms: number
  members: number
  can: { rename: boolean; remove: boolean; leave: boolean; create: boolean }
  onlyWorkspace: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState(name)
  const [confirm, setConfirm] = useState("")
  const [newName, setNewName] = useState("")
  const [createOpen, setCreateOpen] = useState(false)

  const rename = () =>
    start(async () => {
      const res = await renameWorkspace(workspaceId, { name: draft })
      if (!res.ok) return void toast.error(res.error)
      toast.success("Workspace renamed")
      router.refresh()
    })

  const create = () =>
    start(async () => {
      const res = await createWorkspace({ name: newName })
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Switched to ${newName.trim()}`)
      setCreateOpen(false)
      setNewName("")
      router.push("/dashboard")
      router.refresh()
    })

  const leave = () =>
    start(async () => {
      const res = await leaveWorkspace(workspaceId)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`You left ${name}`)
      router.push("/dashboard")
      router.refresh()
    })

  const remove = () =>
    start(async () => {
      const res = await deleteWorkspace(workspaceId, confirm)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`${name} deleted`)
      router.push("/dashboard")
      router.refresh()
    })

  return (
    <div className="max-w-3xl space-y-6">
      <section className="rounded-lg border">
        <div className="space-y-4 p-4">
          <Field>
            <FieldLabel htmlFor="ws-name">Workspace name</FieldLabel>
            <Input id="ws-name" maxLength={80} value={draft} disabled={!can.rename} onChange={(e) => setDraft(e.target.value)} className="max-w-md" />
            <FieldDescription>{can.rename ? "Shown in the workspace switcher and in invitation emails." : "Only owners and admins can rename the workspace."}</FieldDescription>
          </Field>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Owner</dt>
              <dd className="truncate font-medium">{owner}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Your role</dt>
              <dd className="font-medium">{roleLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Forms</dt>
              <dd className="font-mono font-medium tabular-nums">{forms}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Members</dt>
              <dd className="font-mono font-medium tabular-nums">{members}</dd>
            </div>
          </dl>
        </div>
        {can.rename && (
          <div className="flex justify-end border-t bg-muted/30 px-4 py-2.5">
            <Button size="sm" onClick={rename} disabled={pending || draft.trim() === name || draft.trim().length < 2}>
              {pending && <Spinner />} Save name
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <h3 className="text-sm font-semibold">Another workspace</h3>
          <p className="text-sm text-muted-foreground">Separate clients or departments, each with its own team, forms and email sender.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <PlusIcon /> New workspace
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New workspace</DialogTitle>
              <DialogDescription>You&rsquo;ll be its owner; forms in it count toward your plan.</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="new-ws">Name</FieldLabel>
              <Input id="new-ws" maxLength={80} placeholder="Acme Corp" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={create} disabled={pending || newName.trim().length < 2}>
                {pending && <Spinner />} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      {(can.leave || can.remove) && (
        <section className="rounded-lg border border-destructive/30">
          <h3 className="border-b border-destructive/20 px-4 py-2.5 text-sm font-semibold text-destructive">Danger zone</h3>
          {can.leave && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="text-sm font-medium">Leave workspace</div>
                <p className="text-sm text-muted-foreground">You lose access to its forms; your API keys for it are revoked.</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={pending}>
                    <LogOutIcon /> Leave
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave {name}?</AlertDialogTitle>
                    <AlertDialogDescription>An admin will have to invite you again to get back in.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={leave}>
                      Leave workspace
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          {can.remove && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="text-sm font-medium">Delete workspace</div>
                <p className="text-sm text-muted-foreground">
                  {onlyWorkspace ? "This is your only workspace. Create another one first." : `Permanently deletes ${forms} form${forms === 1 ? "" : "s"}, their responses, and all team access.`}
                </p>
              </div>
              <AlertDialog onOpenChange={() => setConfirm("")}>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={pending || onlyWorkspace}>
                    <Trash2Icon /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
                    <AlertDialogDescription>This can&rsquo;t be undone. Type the workspace name to confirm.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <Input aria-label="Workspace name" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={name} />
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" disabled={confirm.trim() !== name || pending} onClick={remove}>
                      Delete forever
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
