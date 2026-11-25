"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  GalleryVerticalEndIcon,
  ListOrderedIcon,
  MessageSquareIcon,
  PlusIcon,
  TrophyIcon,
} from "lucide-react"
import { toast } from "sonner"

import { createForm } from "@/app/actions/forms"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { FormMode } from "@/lib/form-engine"
import { cn } from "@/lib/utils"

export interface TemplateSummary {
  id: string
  name: string
  description: string
  mode: FormMode
  category: string
  highlights: string[]
}

const MODES: { id: FormMode; label: string; description: string; icon: typeof ListOrderedIcon }[] = [
  { id: "CLASSIC", label: "Classic", description: "Single page with sections and columns", icon: GalleryVerticalEndIcon },
  { id: "STEPPER", label: "Stepper", description: "Multi-step wizard with progress", icon: ListOrderedIcon },
  { id: "CARD", label: "Card", description: "One question at a time, conversational", icon: MessageSquareIcon },
  { id: "QUIZ", label: "Quiz", description: "Scored answers with outcomes", icon: TrophyIcon },
]

export function NewFormDialog({
  templates,
  limitReached,
  trigger,
}: {
  templates: TemplateSummary[]
  limitReached: boolean
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [mode, setMode] = useState<FormMode>("CLASSIC")
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const create = (opts: { templateId?: string }) =>
    start(async () => {
      const res = await createForm({ title: title || undefined, mode, templateId: opts.templateId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Form created")
      setOpen(false)
      router.push(`/dashboard/forms/${res.data.id}/edit`)
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <PlusIcon /> New form
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create a form</DialogTitle>
          <DialogDescription>Start from scratch or pick a polished template.</DialogDescription>
        </DialogHeader>
        {limitReached && (
          <Alert variant="destructive">
            <AlertTitle>Form limit reached</AlertTitle>
            <AlertDescription>
              Your plan&apos;s form limit has been reached.{" "}
              <Link href="/dashboard/billing" className="underline underline-offset-4">
                Request an upgrade
              </Link>{" "}
              to create more forms.
            </AlertDescription>
          </Alert>
        )}
        <Tabs defaultValue="blank">
          <TabsList>
            <TabsTrigger value="blank">Blank form</TabsTrigger>
            <TabsTrigger value="template">From template</TabsTrigger>
          </TabsList>
          <TabsContent value="blank" className="mt-4 flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="new-title">Title</FieldLabel>
              <Input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled form" autoFocus />
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                    mode === m.id && "border-foreground bg-muted/50"
                  )}
                >
                  <m.icon className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.description}</div>
                  </div>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={() => create({})} disabled={pending || limitReached}>
                {pending && <Spinner />} Create form
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="template" className="mt-4 flex flex-col gap-4">
            <div className="grid max-h-[50vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                    templateId === t.id && "border-foreground bg-muted/50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {t.mode.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button asChild variant="ghost">
                <Link href="/dashboard/templates" onClick={() => setOpen(false)}>
                  Browse gallery
                </Link>
              </Button>
              <Button onClick={() => templateId && create({ templateId })} disabled={!templateId || pending || limitReached}>
                {pending && <Spinner />} Use template
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
