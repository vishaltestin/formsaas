/**
 * Tiny, safe template language for automation configs:
 *   {{trigger.data.email}}  {{nodes.http_1.body.id}}  {{trigger.data.tags[0]}}
 * No code execution — just dotted path lookups. Optional fallback:
 *   {{trigger.data.name | "there"}}
 */

export type Scope = Record<string, unknown>

const TOKEN = /\{\{\s*([^{}|]+?)\s*(?:\|\s*"([^"]*)"\s*)?\}\}/g
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"])

export function parsePath(path: string): string[] {
  const parts: string[] = []
  for (const raw of path.split(".")) {
    const m = raw.match(/^([^[\]]*)((?:\[\d+\])*)$/)
    if (!m) return []
    if (m[1]) parts.push(m[1])
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) parts.push(idx[1])
  }
  return parts
}

export function resolvePath(scope: unknown, path: string): unknown {
  const parts = parsePath(path.trim())
  if (parts.length === 0) return undefined
  let cur: unknown = scope
  for (const p of parts) {
    if (FORBIDDEN.has(p)) return undefined
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== "object") return undefined
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v) && v.every((x) => typeof x !== "object" || x === null)) return v.map(stringifyValue).join(", ")
  try {
    return JSON.stringify(v)
  } catch {
    return ""
  }
}

/** Plain-text rendering (emails, URLs, chat text). */
export function renderTemplate(template: string, scope: Scope): string {
  if (!template) return ""
  return template.replace(TOKEN, (_m, path: string, fallback?: string) => {
    const v = resolvePath(scope, path)
    const s = stringifyValue(v)
    return s === "" && fallback !== undefined ? fallback : s
  })
}

/** If the template is exactly one token, returns the raw value (keeps numbers/objects typed). */
export function renderValue(template: string, scope: Scope): unknown {
  const t = template.trim()
  const m = t.match(/^\{\{\s*([^{}|]+?)\s*(?:\|\s*"([^"]*)"\s*)?\}\}$/)
  if (m) {
    const v = resolvePath(scope, m[1])
    return v === undefined || v === null || v === "" ? (m[2] ?? v) : v
  }
  return renderTemplate(template, scope)
}

/**
 * JSON-aware rendering for request bodies: tokens inside string literals are
 * JSON-escaped; bare tokens become JSON values. The result always parses if
 * the template itself is valid JSON-with-tokens.
 */
export function renderJsonTemplate(template: string, scope: Scope): string {
  let out = ""
  let last = 0
  for (const m of template.matchAll(TOKEN)) {
    const idx = m.index ?? 0
    out += template.slice(last, idx)
    last = idx + m[0].length
    const v = resolvePath(scope, m[1])
    const value = (v === undefined || v === null || v === "") && m[2] !== undefined ? m[2] : v
    if (insideString(template, idx)) out += JSON.stringify(stringifyValue(value)).slice(1, -1)
    else out += value === undefined ? "null" : JSON.stringify(value)
  }
  return out + template.slice(last)
}

function insideString(src: string, pos: number) {
  let inside = false
  for (let i = 0; i < pos; i++) {
    const c = src[i]
    if (c === "\\" && inside) {
      i++
      continue
    }
    if (c === '"') inside = !inside
  }
  return inside
}

/** Every `{{path}}` referenced in a template. */
export function extractTokens(template: string): string[] {
  return Array.from(template.matchAll(TOKEN), (m) => m[1].trim())
}
