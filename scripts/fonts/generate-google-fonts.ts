/**
 * Regenerates lib/fonts/google-fonts.json — the full Google Fonts catalogue
 * offered by the form theme font picker.
 *
 *   npm run fonts:generate
 *
 * Families, weights, styles and categories come from `google-font-metadata`
 * (the Fontsource project's Google Fonts metadata, a devDependency). The
 * public fonts.google.com metadata feed adds popularity ranks so the picker
 * can list the most used families first; if it is unreachable the catalogue
 * falls back to alphabetical order.
 *
 * Output: one compact string per family, "Family|c|mask", ordered by
 * popularity. c = s(ans) f(serif) d(isplay) h(andwriting) m(onospace);
 * mask = base-36 bitset of weights 100…900 (bits 0–8) plus italic (bit 9).
 */
import { writeFileSync } from "node:fs"
import path from "node:path"

import { APIv1 } from "google-font-metadata"

const meta = APIv1

const CATEGORY: Record<string, string> = { "sans-serif": "s", serif: "f", display: "d", handwriting: "h", monospace: "m" }
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,47}$/

async function popularity(): Promise<Map<string, number>> {
  try {
    const res = await fetch("https://fonts.google.com/metadata/fonts", { signal: AbortSignal.timeout(20_000) })
    const raw = await res.text()
    const json = JSON.parse(raw.slice(raw.indexOf("{"))) as { familyMetadataList: { family: string; popularity: number }[] }
    return new Map(json.familyMetadataList.map((f) => [f.family, f.popularity]))
  } catch (e) {
    console.warn(`[fonts] popularity feed unavailable (${e instanceof Error ? e.message : e}); sorting alphabetically`)
    return new Map()
  }
}

const rank = await popularity()
const rows = Object.values(meta)
  .filter((f) => NAME_RE.test(f.family) && f.weights.length > 0)
  .map((f) => {
    let mask = 0
    for (const w of f.weights) if (w % 100 === 0 && w >= 100 && w <= 900) mask |= 1 << (w / 100 - 1)
    if (f.styles.includes("italic")) mask |= 1 << 9
    return { family: f.family, c: CATEGORY[f.category] ?? "s", mask, rank: rank.get(f.family) ?? Number.MAX_SAFE_INTEGER }
  })
  .filter((f) => (f.mask & 0x1ff) !== 0)
  .sort((a, b) => a.rank - b.rank || a.family.localeCompare(b.family))

const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../lib/fonts/google-fonts.json")
writeFileSync(out, JSON.stringify(rows.map((r) => `${r.family}|${r.c}|${r.mask.toString(36)}`)) + "\n")
console.log(`[fonts] wrote ${rows.length} families to ${path.relative(process.cwd(), out)}`)
