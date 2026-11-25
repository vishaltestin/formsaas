"use client"

import { useMemo, useState } from "react"
import { CheckIcon, ChevronsUpDownIcon, GlobeIcon, UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FONT_CATEGORY_LABELS, findGoogleFont, GOOGLE_FONTS, searchGoogleFonts, type FontCategory, type GoogleFont } from "@/lib/fonts/google-fonts"
import { FONT_GROUPS, FONT_NAME_RE, MAX_CUSTOM_FONT_BYTES, sanitizeFontName, type CustomFont } from "@/lib/form-engine"
import { cn } from "@/lib/utils"

const PAGE = 60
const PREVIEW_CHUNK = 30

const CATEGORY_TABS: { value: FontCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "display", label: "Display" },
  { value: "handwriting", label: "Script" },
  { value: "mono", label: "Mono" },
]

/** Hand-picked starting points shown above the full catalogue when nothing is typed. */
const RECOMMENDED: GoogleFont[] = Array.from(
  new Set(["Funnel Display", "Geologica", "Bricolage Grotesque", "Instrument Sans", ...FONT_GROUPS.flatMap((g) => g.fonts)])
)
  .map((f) => findGoogleFont(f))
  .filter((f): f is GoogleFont => !!f)

/** One stylesheet per chunk of families, each glyph-subset to just the letters of their names (a few KB each). */
function previewHrefs(families: string[]) {
  const hrefs: string[] = []
  for (let i = 0; i < families.length; i += PREVIEW_CHUNK) {
    const names = families.slice(i, i + PREVIEW_CHUNK)
    const text = Array.from(new Set(names.join("").split(""))).sort().join("")
    const q = names.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`).join("&")
    hrefs.push(`https://fonts.googleapis.com/css2?${q}&text=${encodeURIComponent(text)}&display=swap`)
  }
  return hrefs
}

export function FontPicker({
  id,
  value,
  onChange,
  customFonts,
  sameLabel,
}: {
  id?: string
  /** empty string = "same as body" when `sameLabel` is set */
  value: string
  onChange: (family: string) => void
  customFonts: CustomFont[]
  sameLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<FontCategory | "all">("all")
  const [limit, setLimit] = useState(PAGE)
  const typed = query.trim().replace(/\s+/g, " ")
  const browsing = !typed && category === "all"

  const results = useMemo(() => searchGoogleFonts(typed, category), [typed, category])
  const visible = results.slice(0, limit)
  const recommended = browsing ? RECOMMENDED : []
  const hrefs = open ? previewHrefs(Array.from(new Set([...recommended, ...visible].map((f) => f.family)))) : []

  const canUseTyped =
    typed.length > 1 &&
    FONT_NAME_RE.test(typed) &&
    !findGoogleFont(typed) &&
    !customFonts.some((f) => f.family.toLowerCase() === typed.toLowerCase())

  const pick = (family: string) => {
    onChange(family)
    setOpen(false)
    setQuery("")
    setLimit(PAGE)
  }
  const search = (q: string) => {
    setQuery(q)
    setLimit(PAGE)
  }

  const fontItem = (f: GoogleFont, group: string) => (
    <CommandItem key={`${group}-${f.family}`} value={`${group}:${f.family}`} onSelect={() => pick(f.family)}>
      <CheckIcon className={cn(value === f.family ? "opacity-100" : "opacity-0")} />
      <span className="truncate text-[0.9rem]" style={{ fontFamily: `"${f.family}", var(--font-sans)` }}>
        {f.family}
      </span>
      <span className="ml-auto shrink-0 text-[0.65rem] text-muted-foreground">{FONT_CATEGORY_LABELS[f.category]}</span>
    </CommandItem>
  )

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setLimit(PAGE)
      }}
    >
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" size="sm" role="combobox" aria-expanded={open} className="w-full justify-between px-2.5 font-normal">
          <span className="truncate" style={value ? { fontFamily: `"${sanitizeFontName(value)}"` } : undefined}>
            {value || sameLabel || "Choose a font"}
          </span>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        {hrefs.map((href) => (
          <link key={href} rel="stylesheet" href={href} precedence="default" />
        ))}
        <Command shouldFilter={false}>
          <CommandInput placeholder={`Search ${GOOGLE_FONTS.length.toLocaleString()} Google Fonts…`} value={query} onValueChange={search} />
          <div className="border-b px-2 py-1.5">
            <ToggleGroup
              type="single"
              size="sm"
              spacing={0}
              value={category}
              onValueChange={(v) => {
                if (!v) return
                setCategory(v as FontCategory | "all")
                setLimit(PAGE)
              }}
              className="w-full"
              aria-label="Font category"
            >
              {CATEGORY_TABS.map((c) => (
                <ToggleGroupItem key={c.value} value={c.value} className="h-6 flex-1 px-1 text-[0.7rem]">
                  {c.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <CommandList className="max-h-80">
            <CommandEmpty>{typed && !FONT_NAME_RE.test(typed) ? "Use letters, numbers and spaces only." : "No Google Font matches."}</CommandEmpty>
            {canUseTyped && (
              <CommandGroup heading="Not in the catalogue yet?">
                <CommandItem value={`__typed:${typed}`} onSelect={() => pick(typed)}>
                  <GlobeIcon />
                  Use “{typed}” from Google Fonts
                </CommandItem>
              </CommandGroup>
            )}
            {sameLabel && browsing && (
              <CommandGroup>
                <CommandItem value="__same" onSelect={() => pick("")}>
                  <CheckIcon className={cn(value ? "opacity-0" : "opacity-100")} />
                  {sameLabel}
                </CommandItem>
              </CommandGroup>
            )}
            {customFonts.length > 0 && browsing && (
              <CommandGroup heading="Uploaded">
                {customFonts.map((f) => (
                  <CommandItem key={f.family} value={`uploaded:${f.family}`} onSelect={() => pick(f.family)}>
                    <CheckIcon className={cn(value === f.family ? "opacity-100" : "opacity-0")} />
                    <span style={{ fontFamily: `"${f.family}"` }}>{f.family}</span>
                    <UploadIcon className="ml-auto text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {recommended.length > 0 && (
              <>
                {(sameLabel || customFonts.length > 0) && <CommandSeparator />}
                <CommandGroup heading="Recommended">{recommended.map((f) => fontItem(f, "rec"))}</CommandGroup>
                <CommandSeparator />
              </>
            )}
            {visible.length > 0 && (
              <CommandGroup
                heading={
                  typed
                    ? `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"}`
                    : `${category === "all" ? "All Google Fonts" : FONT_CATEGORY_LABELS[category]} · ${results.length.toLocaleString()} by popularity`
                }
              >
                {visible.map((f) => fontItem(f, "all"))}
                {results.length > limit && (
                  <CommandItem value="__more" onSelect={() => setLimit((n) => n + PAGE * 2)} className="justify-center text-muted-foreground">
                    Show more ({(results.length - limit).toLocaleString()} left)
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const FORMAT_BY_EXT: Record<string, { format: CustomFont["format"]; mime: string }> = {
  woff2: { format: "woff2", mime: "font/woff2" },
  woff: { format: "woff", mime: "font/woff" },
  ttf: { format: "truetype", mime: "font/ttf" },
  otf: { format: "opentype", mime: "font/otf" },
}

/** Reads a font file into a sanitised CustomFont (≤ 400 KB). */
export async function readFontFile(file: File): Promise<CustomFont> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  const kind = FORMAT_BY_EXT[ext]
  if (!kind) throw new Error("Upload a .woff2, .woff, .ttf or .otf file.")
  if (file.size > MAX_CUSTOM_FONT_BYTES) throw new Error(`Font files must be ${Math.round(MAX_CUSTOM_FONT_BYTES / 1024)} KB or smaller. WOFF2 files are the most compact.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const base = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_](Regular|Variable|VF|Roman|Book|Medium|Bold|Light|Italic|\d{3})+$/gi, "")
    .replace(/[-_]+/g, " ")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
  const family = sanitizeFontName(base.slice(0, 40), "") || "Custom Font"
  return { family, format: kind.format, dataUrl: `data:${kind.mime};base64,${btoa(binary)}` }
}
