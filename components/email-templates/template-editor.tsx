"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import type { EditorView } from "@codemirror/view"
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BracesIcon,
  CheckIcon,
  FileUpIcon,
  ImageIcon,
  LinkIcon,
  MonitorIcon,
  SaveIcon,
  SendIcon,
  SmartphoneIcon,
  TextIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  previewEmailTemplate,
  saveEmailTemplate,
  sendEmailTemplateTest,
  type AssetInfo,
} from "@/app/actions/email-templates"
import {
  AssetLibrary,
  imgTag,
} from "@/components/email-templates/asset-library"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { MergeTag } from "@/lib/email/template-library"
import { TEMPLATE_HTML_MAX } from "@/lib/email/template-library"
import { cn } from "@/lib/utils"

const CodeEditor = dynamic(
  () =>
    import("@/components/email-templates/code-editor").then(
      (m) => m.CodeEditor
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Spinner /> Loading editor…
      </div>
    ),
  }
)

type Preview = { html: string; text: string; subject: string; bytes: number }
type View = "desktop" | "mobile" | "text"

export function TemplateEditor({
  workspaceId,
  template,
  canEdit,
  allowed,
  usedBy,
  forms,
  mergeTags,
  snippets,
  assets,
  appOrigin,
}: {
  workspaceId: string
  template: {
    id: string
    name: string
    description: string
    subject: string
    html: string
  }
  canEdit: boolean
  allowed: boolean
  usedBy: string[]
  forms: {
    id: string
    title: string
    fields: { key: string; label: string }[]
  }[]
  mergeTags: MergeTag[]
  snippets: { label: string; code: string }[]
  assets: AssetInfo[]
  appOrigin: string
}) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description)
  const [subject, setSubject] = useState(template.subject)
  const [html, setHtml] = useState(template.html)
  const [saved, setSaved] = useState({
    name: template.name,
    description: template.description,
    subject: template.subject,
    html: template.html,
  })
  const [formId, setFormId] = useState<string>(forms[0]?.id ?? "__sample")
  const [view, setView] = useState<View>("desktop")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<{
    message: string
    line: number | null
  } | null>(null)
  const [rendering, setRendering] = useState(false)
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()
  const [imageUrl, setImageUrl] = useState("")
  const editor = useRef<EditorView | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  const subjectRef = useRef<HTMLInputElement>(null)
  const lastFocus = useRef<"subject" | "html">("html")

  const dirty =
    name !== saved.name ||
    description !== saved.description ||
    subject !== saved.subject ||
    html !== saved.html
  const selectedForm = forms.find((f) => f.id === formId)

  // Live preview (debounced) — rendered by the server exactly like a real send.
  useEffect(() => {
    const n = ++seq.current
    const t = setTimeout(async () => {
      setRendering(true)
      const res = await previewEmailTemplate(workspaceId, {
        html,
        subject,
        formId: formId === "__sample" ? null : formId,
      })
      if (n !== seq.current) return
      setRendering(false)
      if (res.ok) {
        setPreview(res.data)
        setError(null)
      } else {
        const line = res.code?.startsWith("line:")
          ? Number(res.code.slice(5))
          : null
        setError({ message: res.error, line })
      }
    }, 450)
    return () => clearTimeout(t)
  }, [html, subject, formId, workspaceId])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  const save = useCallback(() => {
    if (!canEdit) return
    startSave(async () => {
      const res = await saveEmailTemplate(workspaceId, template.id, {
        name,
        description,
        subject,
        html,
      })
      if (!res.ok) {
        const line = res.code?.startsWith("line:")
          ? Number(res.code.slice(5))
          : null
        if (line || res.code === "template")
          setError({ message: res.error, line })
        toast.error(res.error)
        return
      }
      setSaved({ name, description, subject, html })
      toast.success("Template saved")
      router.refresh()
    })
  }, [
    canEdit,
    workspaceId,
    template.id,
    name,
    description,
    subject,
    html,
    router,
  ])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [save])

  function sendTest() {
    startTest(async () => {
      const res = await sendEmailTemplateTest(workspaceId, {
        html,
        subject,
        formId: formId === "__sample" ? null : formId,
      })
      if (!res.ok) return void toast.error(res.error)
      if (res.data.sent)
        toast.success(`Test sent to ${res.data.to} via ${res.data.label}`)
      else if (res.data.error)
        toast.error(`${res.data.label}: ${res.data.error}`)
      else
        toast.message(
          `No email provider is configured — the test was saved to the outbox for ${res.data.to}.`
        )
    })
  }

  function insert(text: string) {
    if (lastFocus.current === "subject" && subjectRef.current) {
      const el = subjectRef.current
      const start = el.selectionStart ?? subject.length
      const end = el.selectionEnd ?? subject.length
      setSubject((s) => (s.slice(0, start) + text + s.slice(end)).slice(0, 200))
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(start + text.length, start + text.length)
      })
      return
    }
    const v = editor.current
    if (!v) return void setHtml((h) => h + text)
    v.dispatch(v.state.replaceSelection(text))
    v.focus()
  }

  function goToLine(line: number) {
    const v = editor.current
    if (!v) return
    const l = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines))
    v.dispatch({
      selection: { anchor: l.from, head: l.to },
      scrollIntoView: true,
    })
    v.focus()
  }

  function importFile(file: File | undefined) {
    if (!file) return
    if (file.size > TEMPLATE_HTML_MAX)
      return void toast.error(
        `That file is larger than ${TEMPLATE_HTML_MAX / 1000} KB.`
      )
    file.text().then((text) => {
      setHtml(text)
      const v = editor.current
      if (v)
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: text },
        })
      toast.success(`Imported ${file.name}`)
      if (fileInput.current) fileInput.current.value = ""
    })
  }

  // Preview iframe is sandboxed (no scripts); hosted images are shown same-origin so they load even if APP_URL points elsewhere.
  const previewDoc = useMemo(() => {
    if (!preview) return ""
    return preview.html.split(`${appOrigin}/api/assets/`).join("/api/assets/")
  }, [preview, appOrigin])

  const warnings = useMemo(
    () => lintSource(html, preview?.bytes ?? 0),
    [html, preview?.bytes]
  )

  const fieldTags = selectedForm?.fields ?? [
    { key: "first_name", label: "First name" },
    { key: "email", label: "Email" },
    { key: "company", label: "Company" },
    { key: "message", label: "Message" },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2.5">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Back to templates"
        >
          <Link href="/dashboard/settings/email-templates">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <Input
          aria-label="Template name"
          value={name}
          maxLength={80}
          disabled={!canEdit}
          onChange={(e) => setName(e.target.value)}
          className="h-8 w-56 font-medium"
          data-testid="template-name"
        />
        <Input
          aria-label="Description"
          placeholder="Description (optional)"
          value={description}
          maxLength={300}
          disabled={!canEdit}
          onChange={(e) => setDescription(e.target.value)}
          className="hidden h-8 w-64 text-sm md:block"
        />
        <span className="ml-1 text-xs text-muted-foreground" aria-live="polite">
          {dirty ? (
            "Unsaved changes"
          ) : (
            <span className="inline-flex items-center gap-1">
              <CheckIcon className="size-3" /> Saved
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {usedBy.length > 0 && (
            <Badge
              variant="secondary"
              className="hidden lg:inline-flex"
              title={usedBy.join("\n")}
            >
              Live in {usedBy.length} {usedBy.length === 1 ? "place" : "places"}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={sendTest}
            disabled={testing || !!error || !canEdit}
          >
            {testing ? <Spinner /> : <SendIcon />} Send test
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={!canEdit || saving || !dirty}
            data-testid="save-template"
          >
            {saving ? <Spinner /> : <SaveIcon />} Save
          </Button>
        </div>
      </div>

      {!allowed && (
        <Alert className="m-4 mb-0 w-auto">
          <AlertTriangleIcon />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            Custom HTML emails need a Pro or Enterprise plan. Emails use the
            built-in design until the workspace owner upgrades.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid min-h-0 flex-1 gap-0 lg:h-[calc(100svh-6.75rem)] lg:min-h-[560px] lg:grid-cols-2">
        {/* Code */}
        <div className="flex min-h-[560px] flex-col border-b lg:min-h-0 lg:border-r lg:border-b-0">
          <div className="space-y-1.5 border-b p-3">
            <label htmlFor="tpl-subject" className="text-xs font-medium">
              Default subject
            </label>
            <Input
              id="tpl-subject"
              ref={subjectRef}
              value={subject}
              maxLength={200}
              disabled={!canEdit}
              placeholder="Thanks for your response · {{form_title}}"
              onFocus={() => (lastFocus.current = "subject")}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              A form&rsquo;s own thank-you subject or an automation&rsquo;s
              subject takes priority when set.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!canEdit}
                >
                  <BracesIcon /> Merge tag
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-0">
                <div className="max-h-80 overflow-y-auto p-1">
                  <TagGroup
                    title={
                      selectedForm
                        ? `Answers · ${selectedForm.title}`
                        : "Answers (sample form)"
                    }
                  >
                    {fieldTags.map((f) => (
                      <TagButton
                        key={f.key}
                        code={`{{${f.key}}}`}
                        label={f.label}
                        onClick={() => insert(`{{${f.key}}}`)}
                      />
                    ))}
                    {fieldTags.length === 0 && (
                      <p className="px-2 py-1 text-xs text-muted-foreground">
                        This form has no questions yet.
                      </p>
                    )}
                  </TagGroup>
                  <TagGroup title="Response">
                    {mergeTags.map((t) => (
                      <TagButton
                        key={t.tag}
                        code={`{{${t.tag}}}`}
                        label={t.label}
                        note={t.note}
                        onClick={() => insert(`{{${t.tag}}}`)}
                      />
                    ))}
                  </TagGroup>
                  <TagGroup title="Blocks">
                    {snippets.map((s) => (
                      <TagButton
                        key={s.label}
                        code={s.code.split("\n")[0]}
                        label={s.label}
                        onClick={() => insert(s.code)}
                      />
                    ))}
                  </TagGroup>
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!canEdit}
                  data-testid="insert-image"
                >
                  <ImageIcon /> Image
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[420px] p-3">
                <AssetLibrary
                  workspaceId={workspaceId}
                  canManage={canEdit}
                  initial={assets}
                  compact
                  onInsert={(a) => insert(imgTag(a))}
                />
                <form
                  className="mt-3 flex gap-2 border-t pt-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!/^https:\/\/\S+$/i.test(imageUrl))
                      return void toast.error(
                        "Use a public https:// image URL."
                      )
                    insert(imgTag({ url: imageUrl, name: "image" }))
                    setImageUrl("")
                  }}
                >
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://cdn.example.com/logo.png"
                    className="h-8 text-xs"
                    aria-label="Image URL"
                  />
                  <Button type="submit" size="sm" variant="outline">
                    <LinkIcon /> Insert URL
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
            <input
              ref={fileInput}
              type="file"
              accept=".html,.htm,text/html"
              className="sr-only"
              aria-label="Import HTML file"
              onChange={(e) => importFile(e.target.files?.[0])}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={!canEdit}
              onClick={() => fileInput.current?.click()}
            >
              <FileUpIcon /> Import .html
            </Button>
            <span className="ml-auto pr-1 text-[11px] text-muted-foreground tabular-nums">
              {(html.length / 1000).toFixed(1)} / {TEMPLATE_HTML_MAX / 1000} KB
            </span>
          </div>
          <div
            className="relative min-h-0 flex-1"
            onFocusCapture={() => (lastFocus.current = "html")}
            data-testid="html-editor"
          >
            <CodeEditor
              value={template.html}
              dark={resolvedTheme === "dark"}
              readOnly={!canEdit}
              errorLine={error?.line ?? null}
              onChange={setHtml}
              onReady={(v) => (editor.current = v)}
            />
          </div>
        </div>

        {/* Preview */}
        <div className="flex min-h-[560px] flex-col bg-muted/40 lg:min-h-0">
          <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={view}
              onValueChange={(v) => v && setView(v as View)}
              aria-label="Preview mode"
            >
              <ToggleGroupItem value="desktop" aria-label="Desktop preview">
                <MonitorIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="mobile" aria-label="Mobile preview">
                <SmartphoneIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="text" aria-label="Plain-text version">
                <TextIcon />
              </ToggleGroupItem>
            </ToggleGroup>
            <Select value={formId} onValueChange={setFormId}>
              <SelectTrigger
                size="sm"
                className="h-8 w-56"
                aria-label="Sample answers from"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__sample">Generic sample answers</SelectItem>
                {forms.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    Sample: {f.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rendering && <Spinner className="text-muted-foreground" />}
            {preview && (
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {(preview.bytes / 1024).toFixed(1)} KB after inlining
              </span>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              data-testid="template-error"
            >
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">{error.message}</span>
              {error.line && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => goToLine(error.line!)}
                >
                  Go to line {error.line}
                </Button>
              )}
            </div>
          )}
          {warnings.length > 0 && (
            <ul
              className="space-y-0.5 border-b bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              data-testid="template-warnings"
            >
              {warnings.map((w) => (
                <li key={w} className="flex gap-1.5">
                  <AlertTriangleIcon className="mt-px size-3 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}

          <div className="border-b bg-background px-4 py-2 text-sm">
            <span className="text-muted-foreground">Subject: </span>
            <span className="font-medium" data-testid="preview-subject">
              {preview?.subject || (
                <em className="font-normal text-muted-foreground">
                  uses the form&rsquo;s subject
                </em>
              )}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 justify-center overflow-auto p-4">
            {view === "text" ? (
              <pre className="w-full max-w-2xl rounded-md border bg-background p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {preview?.text ?? ""}
              </pre>
            ) : (
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={previewDoc}
                data-testid="template-preview"
                className={cn(
                  "h-full min-h-[480px] rounded-md border bg-white shadow-sm transition-[width]",
                  view === "mobile" ? "w-[375px]" : "w-full max-w-[720px]"
                )}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TagGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="py-1">
      <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      {children}
    </div>
  )
}

function TagButton({
  code,
  label,
  note,
  onClick,
}: {
  code: string
  label: string
  note?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
    >
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {note && (
          <span className="block truncate text-[10px] text-muted-foreground">
            {note}
          </span>
        )}
      </span>
      <code className="max-w-[55%] shrink-0 truncate text-muted-foreground">
        {code}
      </code>
    </button>
  )
}

/** Friendly heads-ups about things email clients (or our sanitizer) will change. */
export function lintSource(html: string, renderedBytes: number): string[] {
  const out: string[] = []
  if (/<script\b/i.test(html))
    out.push("Scripts are removed — email clients never run JavaScript.")
  if (/\son[a-z]+\s*=/i.test(html))
    out.push("Event handlers like onclick are removed.")
  if (/<link\b[^>]*stylesheet/i.test(html))
    out.push(
      "Linked stylesheets are removed — put your CSS in a <style> block so it can be inlined."
    )
  if (/<(form|input|button|select|textarea)\b/i.test(html))
    out.push(
      "Form controls are removed — use a link styled as a button instead."
    )
  if (/<(iframe|video|audio|object|embed)\b/i.test(html))
    out.push(
      "Embedded media (iframe/video/audio) is removed — link to it with an image instead."
    )
  if (/src\s*=\s*["']?data:/i.test(html))
    out.push(
      "Embedded data: images are removed (Gmail blocks them) — upload the image under Image instead."
    )
  if (
    /src\s*=\s*["']?https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/i.test(
      html
    )
  )
    out.push(
      "Some image URLs point to a private address — recipients won't be able to load them."
    )
  if (/src\s*=\s*["']http:\/\//i.test(html))
    out.push(
      "Some images use http:// — many clients block insecure images; prefer https://."
    )
  if (
    /url\(\s*['"]?(?!https:)/i.test(html) &&
    /background(-image)?\s*:/i.test(html)
  )
    out.push(
      "CSS background images need absolute https:// URLs and don't show in Outlook — use an <img> for anything important."
    )
  if (renderedBytes > 102 * 1024)
    out.push(
      `The email is ${(renderedBytes / 1024).toFixed(0)} KB — Gmail clips messages over 102 KB behind a “View entire message” link.`
    )
  return out
}
