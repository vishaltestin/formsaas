"use client"

import { CheckIcon, UploadIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { customFontFaces, MAX_CUSTOM_FONTS, MAX_CUSTOM_FONT_BYTES, PRESET_LABELS, THEME_PRESETS, type ThemeColors, type ThemeConfig } from "@/lib/form-engine"
import { cn } from "@/lib/utils"

import { FontPicker, readFontFile } from "./font-picker"
import { ColorInput, LockedNotice, readImage, Row, SectionTitle } from "./inspector-controls"

const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  primary: "Accent",
  primaryText: "Accent text",
  background: "Page background",
  surface: "Card surface",
  text: "Text",
  muted: "Muted text",
  border: "Borders",
  error: "Error",
}

export function ThemeInspector({
  theme,
  onChange,
  allowBranding,
  allowCustomCss,
}: {
  theme: ThemeConfig
  onChange: (patch: Partial<ThemeConfig>, key?: string) => void
  allowBranding: boolean
  allowCustomCss: boolean
}) {
  const faces = customFontFaces(theme)
  const setColor = (k: keyof ThemeColors, v: string) => onChange({ colors: { ...theme.colors, [k]: v } }, `color-${k}`)

  const upload = async (file: File | undefined, kind: "logoUrl" | "coverUrl") => {
    if (!file) return
    try {
      onChange({ [kind]: await readImage(file, kind === "logoUrl" ? 400 : 1000) })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-2">
        <SectionTitle>Presets</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {THEME_PRESETS.map((p) => {
            const active = theme.preset === p.preset
            return (
              <button
                key={p.preset}
                type="button"
                onClick={() =>
                  onChange({
                    ...structuredClone(p),
                    logoUrl: theme.logoUrl,
                    coverUrl: theme.coverUrl,
                    customCss: theme.customCss,
                    customFonts: theme.customFonts,
                  })
                }
                className={cn(
                  "relative overflow-hidden rounded-lg border text-left transition-colors",
                  active ? "border-foreground ring-1 ring-foreground" : "hover:border-foreground/30"
                )}
                aria-pressed={active}
              >
                <div className="flex h-14 items-end gap-1.5 p-2" style={{ background: p.colors.background }}>
                  <div
                    className="flex h-9 flex-1 flex-col justify-center gap-1 px-2"
                    style={{ background: p.colors.surface, borderRadius: Math.min(p.radius, 10), border: `1px solid ${p.colors.border}` }}
                  >
                    <div className="h-1 w-3/4 rounded" style={{ background: p.colors.text, opacity: 0.8 }} />
                    <div className="h-1 w-1/2 rounded" style={{ background: p.colors.muted, opacity: 0.6 }} />
                  </div>
                  <div className="h-4 w-7" style={{ background: p.colors.primary, borderRadius: Math.min(p.radius, 8) }} />
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                  <span className="font-medium">{PRESET_LABELS[p.preset] ?? p.preset}</span>
                  {active && <CheckIcon className="size-3.5" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <SectionTitle>Typography</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <Row label="Body font" htmlFor="theme-body-font">
            <FontPicker id="theme-body-font" value={theme.fontFamily} customFonts={theme.customFonts ?? []} onChange={(fontFamily) => fontFamily && onChange({ fontFamily })} />
          </Row>
          <Row label="Heading font" htmlFor="theme-heading-font">
            <FontPicker
              id="theme-heading-font"
              value={theme.headingFont ?? ""}
              sameLabel="Same as body"
              customFonts={theme.customFonts ?? []}
              onChange={(v) => onChange({ headingFont: v || undefined })}
            />
          </Row>
        </div>
        <p className="text-xs text-muted-foreground">Pick from the list or type the name of any family on Google Fonts.</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Your fonts</span>
            {allowBranding && (theme.customFonts?.length ?? 0) < MAX_CUSTOM_FONTS && (
              <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                <label className="cursor-pointer">
                  <UploadIcon /> Upload font
                  <input
                    type="file"
                    accept=".woff2,.woff,.ttf,.otf"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ""
                      if (!file) return
                      try {
                        const font = await readFontFile(file)
                        const rest = (theme.customFonts ?? []).filter((f) => f.family.toLowerCase() !== font.family.toLowerCase())
                        onChange({ customFonts: [...rest, font], fontFamily: font.family })
                        toast.success(`“${font.family}” uploaded and applied`)
                      } catch (err) {
                        toast.error((err as Error).message)
                      }
                    }}
                  />
                </label>
              </Button>
            )}
          </div>
          {!allowBranding ? (
            <LockedNotice title="Custom font files">Uploading your own typefaces is included with Pro and Enterprise. Google Fonts are available on every plan.</LockedNotice>
          ) : (theme.customFonts?.length ?? 0) === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
              Upload a brand typeface (.woff2, .woff, .ttf or .otf, up to {Math.round(MAX_CUSTOM_FONT_BYTES / 1024)} KB). It is embedded in the form, so it also works in iframes and embeds.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {(theme.customFonts ?? []).map((f) => (
                <li key={f.family} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate" style={{ fontFamily: `"${f.family}"` }}>
                    {f.family}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground uppercase tabular-nums">
                    {f.format} · {Math.round((f.dataUrl.length * 3) / 4 / 1024)} KB
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={`Remove ${f.family}`}
                    onClick={() =>
                      onChange({
                        customFonts: (theme.customFonts ?? []).filter((x) => x.family !== f.family),
                        fontFamily: theme.fontFamily === f.family ? "Inter" : theme.fontFamily,
                        headingFont: theme.headingFont === f.family ? undefined : theme.headingFont,
                      })
                    }
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {faces && <style>{faces}</style>}
        </div>
        <Row label={`Heading size · ${theme.headingSize}px`}>
          <Slider min={20} max={44} step={1} value={[theme.headingSize]} onValueChange={([headingSize]) => onChange({ headingSize }, "hs")} />
        </Row>
        <Row label={`Body size · ${theme.bodySize}px`}>
          <Slider min={13} max={19} step={1} value={[theme.bodySize]} onValueChange={([bodySize]) => onChange({ bodySize }, "bs")} />
        </Row>
      </div>

      <Separator />

      <div className="space-y-3">
        <SectionTitle>Colors</SectionTitle>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
          {(Object.keys(COLOR_LABELS) as (keyof ThemeColors)[]).map((k) => (
            <Row key={k} label={COLOR_LABELS[k]} htmlFor={`color-${k}`}>
              <ColorInput id={`color-${k}`} value={theme.colors[k]} onChange={(v) => setColor(k, v)} />
            </Row>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <SectionTitle>Layout</SectionTitle>
        <Row label={`Corner radius · ${theme.radius}px`}>
          <Slider min={0} max={24} step={1} value={[theme.radius]} onValueChange={([radius]) => onChange({ radius }, "radius")} />
        </Row>
        <Row label={`Form width · ${theme.maxWidth}px`}>
          <Slider min={480} max={1040} step={20} value={[theme.maxWidth]} onValueChange={([maxWidth]) => onChange({ maxWidth }, "mw")} />
        </Row>
        <Row label="Density">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={theme.density}
            onValueChange={(v) => v && onChange({ density: v as ThemeConfig["density"] })}
          >
            <ToggleGroupItem value="compact">Compact</ToggleGroupItem>
            <ToggleGroupItem value="comfortable">Comfortable</ToggleGroupItem>
            <ToggleGroupItem value="spacious">Spacious</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row label="Submit button text" htmlFor="theme-btn">
          <Input id="theme-btn" className="h-8" value={theme.buttonText} onChange={(e) => onChange({ buttonText: e.target.value }, "btn")} />
        </Row>
      </div>

      <Separator />

      <div className="space-y-4">
        <SectionTitle>Branding</SectionTitle>
        {!allowBranding && <LockedNotice title="Logo & cover need Pro">They’re saved but hidden on your live form on the Free plan.</LockedNotice>}
        {(["logoUrl", "coverUrl"] as const).map((kind) => (
          <Row
            key={kind}
            label={kind === "logoUrl" ? "Logo" : "Cover image"}
            description={kind === "logoUrl" ? "PNG/SVG, up to 400 KB, or paste a URL." : "Wide image, up to 1 MB, or paste a URL."}
          >
            <div className="flex items-center gap-2">
              {theme[kind] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={theme[kind]} alt="" className="h-8 w-12 shrink-0 rounded border object-cover" />
              ) : null}
              <Input
                className="h-8"
                placeholder="https://…"
                value={theme[kind]?.startsWith("data:") ? "(uploaded image)" : (theme[kind] ?? "")}
                onChange={(e) => onChange({ [kind]: e.target.value || undefined }, kind)}
              />
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer" aria-label="Upload">
                  <UploadIcon />
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      void upload(e.target.files?.[0], kind)
                      e.target.value = ""
                    }}
                  />
                </label>
              </Button>
              {theme[kind] && (
                <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Remove" onClick={() => onChange({ [kind]: undefined })}>
                  <XIcon />
                </Button>
              )}
            </div>
          </Row>
        ))}
      </div>

      <Separator />

      <div className="space-y-3">
        <SectionTitle>Custom CSS</SectionTitle>
        {!allowCustomCss && <LockedNotice title="Enterprise feature">Custom CSS is stored but only applied on Enterprise.</LockedNotice>}
        <Textarea
          rows={7}
          className="font-mono text-xs"
          placeholder={`.fs-button { letter-spacing: .02em; }\n.fs-label { text-transform: uppercase; }`}
          value={theme.customCss}
          onChange={(e) => onChange({ customCss: e.target.value }, "css")}
        />
        <p className="text-xs text-muted-foreground">
          Scoped to this form. Target <code>.fs-card</code>, <code>.fs-input</code>, <code>.fs-label</code>, <code>.fs-button</code>.
        </p>
      </div>
    </div>
  )
}
