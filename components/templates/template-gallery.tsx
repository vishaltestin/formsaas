"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CheckIcon,
  EyeIcon,
  GalleryVerticalEndIcon,
  ListOrderedIcon,
  MessageSquareIcon,
  SearchIcon,
  TrophyIcon,
} from "lucide-react"
import { toast } from "sonner"

import { createForm } from "@/app/actions/forms"
import { FormRenderer } from "@/components/renderer/form-renderer"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { getSteps, isInputField, toPublicSettings, type FormMode } from "@/lib/form-engine"
import type { FormTemplate } from "@/lib/templates"

const MODE_META: Record<FormMode, { label: string; icon: typeof ListOrderedIcon }> = {
  CLASSIC: { label: "Classic", icon: GalleryVerticalEndIcon },
  STEPPER: { label: "Stepper", icon: ListOrderedIcon },
  CARD: { label: "Card", icon: MessageSquareIcon },
  QUIZ: { label: "Quiz", icon: TrophyIcon },
}

/** A tiny themed thumbnail derived from the template's own tokens. */
function Thumb({ t }: { t: FormTemplate }) {
  const c = t.theme.colors
  const fields = t.schema.fields.filter(isInputField).slice(0, 3)
  return (
    <div className="relative h-36 overflow-hidden border-b" style={{ background: c.background }}>
      <div
        className="absolute inset-x-6 top-5 bottom-0 space-y-2 rounded-t-md border border-b-0 p-3"
        style={{ background: c.surface, borderColor: c.border, color: c.text, fontFamily: t.theme.fontFamily }}
      >
        <div className="h-2 w-2/3 rounded-sm" style={{ background: c.text, opacity: 0.85 }} />
        {fields.map((f) => (
          <div key={f.id} className="space-y-1">
            <div className="h-1.5 w-1/3 rounded-sm" style={{ background: c.muted, opacity: 0.5 }} />
            <div className="h-4 rounded-sm border" style={{ borderColor: c.border, background: c.background }} />
          </div>
        ))}
        <div className="h-4 w-16 rounded-sm" style={{ background: c.primary }} />
      </div>
    </div>
  )
}

export function TemplateGallery({ templates, limitReached, maxForms }: { templates: FormTemplate[]; limitReached: boolean; maxForms: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [preview, setPreview] = useState<FormTemplate | null>(null)

  const categories = useMemo(() => Array.from(new Set(templates.map((t) => t.category))), [templates])
  const shown = templates.filter(
    (t) =>
      (category === "all" || t.category === category) &&
      (!query.trim() || `${t.name} ${t.description} ${t.category} ${t.highlights.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
  )

  const use = (t: FormTemplate) => {
    setBusyId(t.id)
    start(async () => {
      const res = await createForm({ templateId: t.id })
      if (!res.ok) {
        setBusyId(null)
        return void toast.error(res.error)
      }
      toast.success(`Created “${t.name}”`)
      router.push(`/dashboard/forms/${res.data.id}/edit`)
    })
  }

  return (
    <div className="space-y-4">
      {limitReached && (
        <Alert>
          <AlertTitle>You’ve used all {maxForms} forms on your plan</AlertTitle>
          <AlertDescription>Delete a form or upgrade to create new ones from templates.</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/billing">Upgrade</Link>
            </Button>
          </AlertAction>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-8 w-full sm:w-64">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search templates" value={query} onChange={(e) => setQuery(e.target.value)} />
        </InputGroup>
        <ToggleGroup type="single" variant="outline" size="sm" value={category} onValueChange={(v) => v && setCategory(v)} className="flex-wrap">
          <ToggleGroupItem value="all" className="px-3">
            All
          </ToggleGroupItem>
          {categories.map((c) => (
            <ToggleGroupItem key={c} value={c} className="px-3">
              {c}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {shown.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => {
            const Mode = MODE_META[t.mode]
            const questions = t.schema.fields.filter(isInputField).length
            const steps = getSteps(t.schema).length
            return (
              <Card key={t.id} className="gap-0 overflow-hidden py-0">
                <button type="button" className="text-left" onClick={() => setPreview(t)} aria-label={`Preview ${t.name}`}>
                  <Thumb t={t} />
                </button>
                <CardHeader className="gap-1.5 px-4 pt-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <Mode.icon className="size-3" /> {Mode.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{t.category}</span>
                  </div>
                  <CardTitle className="text-sm">{t.name}</CardTitle>
                  <CardDescription className="line-clamp-2 text-xs">{t.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 px-4 pt-3">
                  <ul className="space-y-1">
                    {t.highlights.slice(0, 3).map((h) => (
                      <li key={h} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <CheckIcon className="mt-0.5 size-3 shrink-0" /> {h}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="gap-2 px-4 pt-4 pb-4">
                  <span className="mr-auto text-xs text-muted-foreground tabular-nums">
                    {questions} questions{steps > 1 ? ` · ${steps} steps` : ""}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setPreview(t)}>
                    <EyeIcon /> Preview
                  </Button>
                  <Button size="sm" onClick={() => use(t)} disabled={pending || limitReached}>
                    {busyId === t.id && <Spinner />} Use
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No templates match</EmptyTitle>
            <EmptyDescription>Try another search or category.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="flex h-[90svh] w-[96vw] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          {preview && (
            <>
              <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b px-4 py-3 pr-12">
                <div className="min-w-0">
                  <DialogTitle className="text-sm">{preview.name}</DialogTitle>
                  <DialogDescription className="truncate text-xs">{preview.description}</DialogDescription>
                </div>
                <Button size="sm" className="ml-auto" onClick={() => use(preview)} disabled={pending || limitReached}>
                  {busyId === preview.id && <Spinner />} Use this template
                </Button>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3">
                <div className="mx-auto h-full overflow-auto rounded-lg border bg-background">
                  <FormRenderer
                    formId={`tpl-${preview.id}`}
                    slug={preview.id}
                    title={preview.name}
                    description={preview.description}
                    mode={preview.mode}
                    schema={preview.schema}
                    theme={preview.theme}
                    settings={toPublicSettings(preview.settings)}
                    preview
                    logicEnabled
                    showBadge={false}
                    allowCustomCss={false}
                    allowBranding
                    maxUploadMb={10}
                  />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
