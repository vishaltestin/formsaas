"use client"

import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react"
import Link from "next/link"
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react"
import {
  CheckIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LinkIcon,
  MessageSquareIcon,
  MousePointerClickIcon,
  PanelRightIcon,
  PencilIcon,
  RocketIcon,
  SquareStackIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import { updateSlug } from "@/app/actions/forms"
import { LockedNotice } from "@/components/builder/inspector-controls"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const subscribe = () => () => {}

function useOrigin(fallback: string) {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => fallback
  )
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600)
    } catch {
      toast.error("Copy failed — select the text and copy manually")
    }
  }
  return { copied, copy }
}

function CodeBlock({ code, id, copied, onCopy }: { code: string; id: string; copied: boolean; onCopy: (id: string, code: string) => void }) {
  return (
    <div className="relative">
      <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/50 p-3 pr-12 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
        {code}
      </pre>
      <Button size="icon" variant="outline" className="absolute top-2 right-2 size-7 bg-background" onClick={() => onCopy(id, code)} aria-label="Copy code">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}

export function SharePanel({
  formId,
  slug: initialSlug,
  title,
  status,
  appUrl,
  advancedEmbeds,
  accent,
}: {
  formId: string
  slug: string
  title: string
  status: "DRAFT" | "PUBLISHED" | "CLOSED"
  appUrl: string
  advancedEmbeds: boolean
  accent: string
}) {
  const origin = useOrigin(appUrl)
  const [slug, setSlug] = useState(initialSlug)
  const [editing, setEditing] = useState(false)
  const [draftSlug, setDraftSlug] = useState(initialSlug)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const { copied, copy } = useCopy()
  const qrRef = useRef<HTMLCanvasElement>(null)
  const svgWrapRef = useRef<HTMLDivElement>(null)

  const [height, setHeight] = useState("auto")
  const [buttonText, setButtonText] = useState("Open form")
  const [buttonColor, setButtonColor] = useState(accent)
  const [popupDelay, setPopupDelay] = useState("0")
  const [tabLabel, setTabLabel] = useState("Feedback")
  const [launcherType, setLauncherType] = useState<"popup" | "drawer">("popup")
  const [previewKind, setPreviewKind] = useState<"popup" | "drawer" | null>(null)

  const formUrl = `${origin}/f/${slug}`
  const embedUrl = `${origin}/embed/${slug}`
  const loader = `${origin}/api/embed.js`

  const snippets = useMemo(() => {
    const fixed = height !== "auto"
    return {
      iframe: fixed
        ? `<iframe src="${embedUrl}?src=iframe" title="${title.replace(/"/g, "&quot;")}" width="100%" height="${height}" style="border:0;max-width:100%" loading="lazy"></iframe>`
        : `<iframe id="fs-${slug}" src="${embedUrl}?src=iframe" title="${title.replace(/"/g, "&quot;")}" width="100%" height="600" style="border:0;max-width:100%" loading="lazy"></iframe>
<script>
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "FORM_RESIZE" && e.data.slug === "${slug}") {
      document.getElementById("fs-${slug}").style.height = e.data.height + "px";
    }
  });
</script>`,
      script: `<div data-formstudio-inline="${slug}"></div>
<script src="${loader}" async></script>`,
      popup: `<button type="button" data-formstudio-popup="${slug}" style="background:${buttonColor};color:#fff;border:0;border-radius:8px;padding:10px 16px;font:600 14px system-ui;cursor:pointer">${buttonText}</button>
<script src="${loader}" async></script>${
        Number(popupDelay) > 0
          ? `

<!-- Or open automatically after ${popupDelay}s -->
<script src="${loader}" data-popup="${slug}" data-delay="${popupDelay}" async></script>`
          : ""
      }`,
      drawer: `<!-- Floating side tab that opens a slide-in drawer -->
<script src="${loader}" data-tab="${slug}" data-tab-label="${tabLabel}" data-tab-color="${buttonColor}" async></script>

<!-- Or open the drawer from any element -->
<a href="#" data-formstudio-drawer="${slug}">${tabLabel}</a>`,
      launcher: `<script src="${loader}" data-launcher="${slug}" data-launcher-text="${buttonText}" data-launcher-color="${buttonColor}" data-launcher-type="${launcherType}" async></script>`,
      js: `<script src="${loader}" async></script>
<script>
  // Open programmatically, e.g. after a purchase
  window.DigitalFueled && window.DigitalFueled.open("${slug}", { type: "popup" }); // or "drawer"
</script>`,
    }
  }, [embedUrl, loader, slug, title, height, buttonColor, buttonText, popupDelay, tabLabel, launcherType])

  const saveSlug = () =>
    start(async () => {
      setSlugError(null)
      const res = await updateSlug(formId, draftSlug)
      if (!res.ok) return setSlugError(res.error)
      setSlug(res.data.slug)
      setDraftSlug(res.data.slug)
      setEditing(false)
      toast.success("Link updated", { description: "Old links and embeds using the previous slug stop working." })
    })

  const downloadPng = () => {
    const canvas = qrRef.current
    if (!canvas) return
    const a = document.createElement("a")
    a.href = canvas.toDataURL("image/png")
    a.download = `${slug}-qr.png`
    a.click()
  }
  const downloadSvg = () => {
    const svg = svgWrapRef.current?.querySelector("svg")
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${slug}-qr.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      {status !== "PUBLISHED" && (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>{status === "CLOSED" ? "This form is closed" : "This form isn’t published yet"}</AlertTitle>
          <AlertDescription>
            {status === "CLOSED"
              ? "Visitors will see your closed message instead of the form."
              : "Links and embeds show a “not published” message until you publish from the builder."}
          </AlertDescription>
          <AlertAction>
            <Button size="sm" asChild>
              <Link href={`/dashboard/forms/${formId}/edit`}>
                <RocketIcon /> Open builder
              </Link>
            </Button>
          </AlertAction>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LinkIcon className="size-4" /> Share link
            </CardTitle>
            <CardDescription>Send this link anywhere — email, social, SMS or a QR code.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <InputGroup>
              <InputGroupInput readOnly value={formUrl} aria-label="Form link" onFocus={(e) => e.currentTarget.select()} />
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" onClick={() => copy("link", formUrl)} aria-label="Copy link">
                  {copied === "link" ? <CheckIcon /> : <CopyIcon />}
                </InputGroupButton>
                <InputGroupButton size="icon-xs" asChild aria-label="Open link">
                  <a href={formUrl} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon />
                  </a>
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>

            {editing ? (
              <Field>
                <FieldLabel htmlFor="slug">Custom link</FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <InputGroup className="flex-1">
                    <InputGroupAddon>
                      <InputGroupText className="max-w-[45vw] truncate">{origin.replace(/^https?:\/\//, "")}/f/</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="slug"
                      value={draftSlug}
                      aria-invalid={!!slugError || undefined}
                      onChange={(e) => setDraftSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                      onKeyDown={(e) => e.key === "Enter" && saveSlug()}
                      autoFocus
                    />
                  </InputGroup>
                  <div className="flex gap-2">
                    <Button onClick={saveSlug} disabled={pending || draftSlug === slug}>
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditing(false)
                        setDraftSlug(slug)
                        setSlugError(null)
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
                {slugError ? (
                  <p className="text-sm text-destructive">{slugError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Lowercase letters, numbers and dashes. Changing it breaks existing links.</p>
                )}
              </Field>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <PencilIcon /> Customize link
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">QR code</CardTitle>
            <CardAction>
              <Badge variant="outline">{slug}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="rounded-lg border bg-white p-3">
              <QRCodeCanvas ref={qrRef} value={formUrl} size={168} marginSize={1} level="M" />
            </div>
            <div ref={svgWrapRef} className="hidden" aria-hidden>
              <QRCodeSVG value={formUrl} size={512} marginSize={2} level="M" />
            </div>
            <div className="flex w-full gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={downloadPng}>
                <DownloadIcon /> PNG
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={downloadSvg}>
                <DownloadIcon /> SVG
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CodeIcon className="size-4" /> Embed on your site
          </CardTitle>
          <CardDescription>
            Embeds load from <code className="text-xs">/embed/{slug}</code>, which is the only route allowed inside third-party iframes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="iframe">
            <TabsList variant="line" className="mb-4 flex-wrap">
              <TabsTrigger value="iframe">
                <SquareStackIcon /> iFrame
              </TabsTrigger>
              <TabsTrigger value="script">
                <CodeIcon /> Inline script
              </TabsTrigger>
              <TabsTrigger value="popup">
                <MousePointerClickIcon /> Popup
              </TabsTrigger>
              <TabsTrigger value="drawer">
                <PanelRightIcon /> Drawer & tab
              </TabsTrigger>
              <TabsTrigger value="launcher">
                <MessageSquareIcon /> Launcher
              </TabsTrigger>
            </TabsList>

            <TabsContent value="iframe" className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <Field className="w-44">
                  <FieldLabel>Height</FieldLabel>
                  <Select value={height} onValueChange={setHeight}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-resize</SelectItem>
                      <SelectItem value="500">500px</SelectItem>
                      <SelectItem value="700">700px</SelectItem>
                      <SelectItem value="900">900px</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <p className="pb-1.5 text-xs text-muted-foreground">
                  Auto-resize listens for <code>FORM_RESIZE</code> messages posted by the form.
                </p>
              </div>
              <CodeBlock id="iframe" code={snippets.iframe} copied={copied === "iframe"} onCopy={copy} />
              <div className="overflow-hidden rounded-lg border">
                <div className="border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">Live preview</div>
                <iframe src={`/embed/${slug}?src=iframe`} title="Embed preview" className="h-[460px] w-full border-0 bg-transparent" />
              </div>
            </TabsContent>

            <TabsContent value="script" className="space-y-4">
              {!advancedEmbeds && <LockedNotice title="Script embeds need Pro">Free plans can use the iframe embed and direct link.</LockedNotice>}
              <p className="text-sm text-muted-foreground">
                Drop-in widget that auto-resizes, forwards UTM parameters and records the embed channel in analytics.
              </p>
              <CodeBlock id="script" code={snippets.script} copied={copied === "script"} onCopy={copy} />
              <CodeBlock id="js" code={snippets.js} copied={copied === "js"} onCopy={copy} />
            </TabsContent>

            <TabsContent value="popup" className="space-y-4">
              {!advancedEmbeds && <LockedNotice title="Popup embeds need Pro">Upgrade to open your form in a modal.</LockedNotice>}
              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="btn-text">Button text</FieldLabel>
                  <Input id="btn-text" className="h-8" value={buttonText} onChange={(e) => setButtonText(e.target.value.replace(/[<>"]/g, ""))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="btn-color">Button color</FieldLabel>
                  <div className="flex gap-2">
                    <input
                      id="btn-color"
                      type="color"
                      value={buttonColor}
                      onChange={(e) => setButtonColor(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded-md border bg-transparent p-0.5"
                    />
                    <Input className="h-8 font-mono text-xs" value={buttonColor} readOnly />
                  </div>
                </Field>
                <Field>
                  <FieldLabel>Auto-open</FieldLabel>
                  <Select value={popupDelay} onValueChange={setPopupDelay}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Only on click</SelectItem>
                      <SelectItem value="3">After 3 seconds</SelectItem>
                      <SelectItem value="10">After 10 seconds</SelectItem>
                      <SelectItem value="30">After 30 seconds</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <CodeBlock id="popup" code={snippets.popup} copied={copied === "popup"} onCopy={copy} />
              <Button variant="outline" onClick={() => setPreviewKind("popup")}>
                <MousePointerClickIcon /> Try the popup
              </Button>
            </TabsContent>

            <TabsContent value="drawer" className="space-y-4">
              {!advancedEmbeds && <LockedNotice title="Drawer embeds need Pro">Upgrade for slide-in drawers and feedback tabs.</LockedNotice>}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="tab-label">Tab label</FieldLabel>
                  <Input id="tab-label" className="h-8" value={tabLabel} onChange={(e) => setTabLabel(e.target.value.replace(/[<>"]/g, ""))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tab-color">Tab color</FieldLabel>
                  <div className="flex gap-2">
                    <input
                      id="tab-color"
                      type="color"
                      value={buttonColor}
                      onChange={(e) => setButtonColor(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded-md border bg-transparent p-0.5"
                    />
                    <Input className="h-8 font-mono text-xs" value={buttonColor} readOnly />
                  </div>
                </Field>
              </div>
              <CodeBlock id="drawer" code={snippets.drawer} copied={copied === "drawer"} onCopy={copy} />
              <Button variant="outline" onClick={() => setPreviewKind("drawer")}>
                <PanelRightIcon /> Try the drawer
              </Button>
            </TabsContent>

            <TabsContent value="launcher" className="space-y-4">
              {!advancedEmbeds && <LockedNotice title="Launcher needs Pro">A floating button that opens your form anywhere on the page.</LockedNotice>}
              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="l-text">Button text</FieldLabel>
                  <Input id="l-text" className="h-8" value={buttonText} onChange={(e) => setButtonText(e.target.value.replace(/[<>"]/g, ""))} />
                </Field>
                <Field>
                  <FieldLabel>Opens as</FieldLabel>
                  <Select value={launcherType} onValueChange={(v) => setLauncherType(v as "popup" | "drawer")}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="popup">Popup</SelectItem>
                      <SelectItem value="drawer">Drawer</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Preview</FieldLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setPreviewKind(launcherType)}
                        className="h-8 rounded-full px-4 text-sm font-semibold text-white"
                        style={{ background: buttonColor }}
                      >
                        {buttonText}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Click to try it</TooltipContent>
                  </Tooltip>
                </Field>
              </div>
              <CodeBlock id="launcher" code={snippets.launcher} copied={copied === "launcher"} onCopy={copy} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={previewKind === "popup"} onOpenChange={(o) => !o && setPreviewKind(null)}>
        <DialogContent className="max-h-[88svh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-sm">Popup preview</DialogTitle>
            <DialogDescription className="text-xs">This is how the popup embed appears on your site.</DialogDescription>
          </DialogHeader>
          <iframe src={`/embed/${slug}?src=popup`} title="Popup preview" className="h-[70svh] w-full border-0" />
        </DialogContent>
      </Dialog>
      <Sheet open={previewKind === "drawer"} onOpenChange={(o) => !o && setPreviewKind(null)}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle className="text-sm">Drawer preview</SheetTitle>
            <SheetDescription className="text-xs">Slides in from the right on your site.</SheetDescription>
          </SheetHeader>
          <iframe src={`/embed/${slug}?src=drawer`} title="Drawer preview" className="min-h-0 w-full flex-1 border-0" />
        </SheetContent>
      </Sheet>
    </div>
  )
}
