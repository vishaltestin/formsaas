import { createHmac } from "node:crypto"

import { renderJsonTemplate, renderTemplate, renderValue, resolvePath, stringifyValue, type Scope } from "./template"
import type {
  ApprovalConfig,
  AutomationNode,
  ChatConfig,
  ConditionConfig,
  ConditionRule,
  DelayConfig,
  EmailConfig,
  HttpConfig,
  NotifyConfig,
  TransformConfig,
  UpdateSubmissionConfig,
} from "./types"

/** Side effects are injected so the executors are unit-testable without a DB or network. */
export interface ExecEnv {
  isTest: boolean
  runId: string
  formId: string
  ownerId: string
  submissionId: string | null
  allowPrivateNetwork: boolean
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  sendEmail: (input: { to: string[]; subject: string; html: string; replyTo?: string }) => Promise<{ id: string | null; status: string }>
  notify: (input: { userId: string; title: string; body?: string; href?: string; kind: string }) => Promise<{ id: string }>
  updateSubmission: (
    submissionId: string,
    patch: { status?: string; addTags: string[]; removeTags: string[]; note?: string; noteMode: "append" | "replace" }
  ) => Promise<{ status: string; tags: string[]; notes: string | null }>
  requestApproval: (input: { nodeId: string; label: string; reviewers: string[]; message: string; notifyOwner: boolean }) => Promise<{ notified: string[] }>
}

export type ExecResult =
  | { output: unknown; input?: unknown; branch?: string; attempts?: number }
  | { pause: { kind: "approval" } | { kind: "delay"; resumeAt: Date; waitMs: number }; input?: unknown; output?: unknown }

export class NodeExecutionError extends Error {
  constructor(
    message: string,
    public output?: unknown,
    public input?: unknown,
    public attempts = 1
  ) {
    super(message)
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function splitList(s: string) {
  return s
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "boolean") return v ? 1 : 0
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

function isEmpty(v: unknown) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && v !== null && Object.keys(v).length === 0)
}

export function evaluateRule(rule: ConditionRule, scope: Scope): boolean {
  const left = renderValue(rule.left ?? "", scope)
  const right = renderValue(rule.right ?? "", scope)
  const ls = stringifyValue(left).toLowerCase()
  const rs = stringifyValue(right).toLowerCase()
  const ln = toNumber(left)
  const rn = toNumber(right)
  switch (rule.op) {
    case "equals":
      return ln !== null && rn !== null ? ln === rn : ls === rs
    case "not_equals":
      return ln !== null && rn !== null ? ln !== rn : ls !== rs
    case "contains":
      return Array.isArray(left) ? left.some((x) => stringifyValue(x).toLowerCase() === rs) : ls.includes(rs)
    case "not_contains":
      return Array.isArray(left) ? !left.some((x) => stringifyValue(x).toLowerCase() === rs) : !ls.includes(rs)
    case "starts_with":
      return ls.startsWith(rs)
    case "ends_with":
      return ls.endsWith(rs)
    case "gt":
      return ln !== null && rn !== null && ln > rn
    case "gte":
      return ln !== null && rn !== null && ln >= rn
    case "lt":
      return ln !== null && rn !== null && ln < rn
    case "lte":
      return ln !== null && rn !== null && ln <= rn
    case "is_empty":
      return isEmpty(left)
    case "is_not_empty":
      return !isEmpty(left)
    case "is_true":
      return left === true || ls === "true" || ls === "yes" || ln === 1
    case "is_false":
      return left === false || ls === "false" || ls === "no" || ln === 0 || isEmpty(left)
    default:
      return false
  }
}

export function evaluateCondition(config: ConditionConfig, scope: Scope) {
  const results = (config.rules ?? []).map((r) => ({ ...r, passed: evaluateRule(r, scope) }))
  const result = config.match === "any" ? results.some((r) => r.passed) : results.every((r) => r.passed)
  return { result, rules: results }
}

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i

export function assertSafeUrl(raw: string, allowPrivate: boolean): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new NodeExecutionError(`Invalid URL: ${raw.slice(0, 200)}`)
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new NodeExecutionError("Only http(s) URLs are allowed")
  if (!allowPrivate && PRIVATE_HOST.test(url.hostname)) throw new NodeExecutionError(`Requests to private network hosts are blocked (${url.hostname})`)
  return url
}

function delayMs(c: DelayConfig) {
  return Math.round(Number(c.amount) * ({ seconds: 1e3, minutes: 6e4, hours: 36e5, days: 864e5 }[c.unit] ?? 6e4))
}

async function readBody(res: Response) {
  const text = (await res.text().catch(() => "")).slice(0, 64 * 1024)
  const type = res.headers.get("content-type") ?? ""
  if (type.includes("json") || /^\s*[[{]/.test(text)) {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  }
  return text
}

export function hmacSignature(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

async function executeHttp(c: HttpConfig, scope: Scope, env: ExecEnv) {
  const url = assertSafeUrl(renderTemplate(c.url, scope).trim(), env.allowPrivateNetwork)
  const headers: Record<string, string> = { "User-Agent": "DigitalFueled-Automations/1.0" }
  for (const h of c.headers ?? []) {
    const k = h.key.trim()
    if (/^[a-zA-Z0-9-]+$/.test(k)) headers[k] = renderTemplate(h.value, scope).replace(/[\r\n]/g, " ")
  }
  if (c.auth === "bearer" && c.authToken) headers.Authorization = `Bearer ${renderTemplate(c.authToken, scope)}`
  if (c.auth === "basic" && c.authUser)
    headers.Authorization = `Basic ${Buffer.from(`${renderTemplate(c.authUser, scope)}:${renderTemplate(c.authPassword ?? "", scope)}`).toString("base64")}`
  if (c.auth === "header" && c.authHeaderName && c.authToken) headers[c.authHeaderName] = renderTemplate(c.authToken, scope)

  const hasBody = !["GET", "DELETE"].includes(c.method) && c.body.trim() !== ""
  let body: string | undefined
  if (hasBody) {
    body = renderJsonTemplate(c.body, scope)
    let isJson = true
    try {
      JSON.parse(body)
    } catch {
      isJson = false
    }
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = isJson ? "application/json" : "text/plain"
  }
  if (c.hmacSecret) {
    const ts = Math.floor(Date.now() / 1000)
    headers["X-FormStudio-Signature"] = `t=${ts},v1=${hmacSignature(c.hmacSecret, ts, body ?? "")}`
  }
  const redactedHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k, /authorization|token|secret|key|signature/i.test(k) ? `${v.slice(0, 6)}…` : v])
  )
  const input = { method: c.method, url: url.toString(), headers: redactedHeaders, body: body ? safeParse(body) : undefined }

  const maxAttempts = Math.max(1, Math.min(6, (Number(c.retries) || 0) + 1))
  let lastError = ""
  let lastOutput: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now()
    try {
      const res = await env.fetch(url, {
        method: c.method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(Math.max(500, Math.min(30000, Number(c.timeoutMs) || 10000))),
      })
      const output = {
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(["content-type", "location", "x-request-id"].flatMap((h) => (res.headers.get(h) ? [[h, res.headers.get(h)!]] : []))),
        body: await readBody(res),
        durationMs: Date.now() - started,
        attempts: attempt,
      }
      lastOutput = output
      const retryable = res.status >= 500 || res.status === 429
      if (res.ok || !retryable || attempt === maxAttempts) {
        if (!res.ok && c.failOnHttpError) throw new NodeExecutionError(`HTTP ${res.status}`, output, input, attempt)
        return { input, output, attempts: attempt }
      }
      lastError = `HTTP ${res.status}`
    } catch (e) {
      if (e instanceof NodeExecutionError) throw e
      lastError = e instanceof Error ? (e.name === "TimeoutError" || e.name === "AbortError" ? "Request timed out" : e.message) : "Request failed"
      if (attempt === maxAttempts) throw new NodeExecutionError(lastError, lastOutput, input, attempt)
    }
    await env.sleep(Math.min(5000, 250 * 2 ** (attempt - 1)))
  }
  throw new NodeExecutionError(lastError || "Request failed", lastOutput, input, maxAttempts)
}

function safeParse(s: string) {
  try {
    return JSON.parse(s) as unknown
  } catch {
    return s
  }
}

function textToHtml(text: string) {
  const esc = text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string)
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("")
}

function coerce(value: unknown, type: TransformConfig["mappings"][number]["type"]) {
  switch (type) {
    case "number": {
      const n = toNumber(value)
      return n ?? 0
    }
    case "boolean":
      return value === true || ["true", "yes", "1"].includes(stringifyValue(value).toLowerCase())
    case "json":
      return typeof value === "string" ? safeParse(value) : value
    default:
      return stringifyValue(value)
  }
}

/** Executes one node. Branching nodes return `branch`; pausing nodes return `pause`. */
export async function executeNode(node: AutomationNode, scope: Scope, env: ExecEnv): Promise<ExecResult> {
  switch (node.type) {
    case "trigger":
      return { output: scope.trigger }
    case "condition": {
      const r = evaluateCondition(node.data.config as ConditionConfig, scope)
      return { input: { match: (node.data.config as ConditionConfig).match, rules: r.rules }, output: { result: r.result }, branch: r.result ? "true" : "false" }
    }
    case "transform": {
      const c = node.data.config as TransformConfig
      const out: Record<string, unknown> = {}
      for (const m of c.mappings ?? []) {
        if (!m.key) continue
        const raw = m.type === "json" ? safeParse(renderJsonTemplate(m.value, scope)) : renderValue(m.value, scope)
        out[m.key] = coerce(raw, m.type)
      }
      return { output: out }
    }
    case "delay": {
      const c = node.data.config as DelayConfig
      const waitMs = delayMs(c)
      if (env.isTest) return { output: { waitedMs: 0, wouldWaitMs: waitMs, skippedInTest: true } }
      return { pause: { kind: "delay", resumeAt: new Date(Date.now() + waitMs), waitMs }, input: { amount: c.amount, unit: c.unit } }
    }
    case "approval": {
      const c = node.data.config as ApprovalConfig
      const reviewers = splitList(renderTemplate(c.reviewers ?? "", scope)).filter((e) => EMAIL_RE.test(e))
      const message = renderTemplate(c.message ?? "", scope)
      const res = await env.requestApproval({ nodeId: node.id, label: node.data.label, reviewers, message, notifyOwner: c.notifyOwner })
      return { pause: { kind: "approval" }, input: { reviewers, message }, output: { notified: res.notified } }
    }
    case "http": {
      const r = await executeHttp(node.data.config as HttpConfig, scope, env)
      return { input: r.input, output: r.output, attempts: r.attempts }
    }
    case "email": {
      const c = node.data.config as EmailConfig
      const to = splitList(renderTemplate(c.to, scope)).filter((e) => EMAIL_RE.test(e))
      if (to.length === 0) throw new NodeExecutionError(`No valid recipients in "${renderTemplate(c.to, scope) || c.to}"`)
      const subject = renderTemplate(c.subject, scope).slice(0, 300)
      const text = renderTemplate(c.body, scope)
      const replyTo = c.replyTo ? renderTemplate(c.replyTo, scope) : undefined
      const res = await env.sendEmail({ to, subject, html: textToHtml(text), replyTo: replyTo && EMAIL_RE.test(replyTo) ? replyTo : undefined })
      return { input: { to, subject, body: text }, output: { outboxId: res.id, to, status: res.status } }
    }
    case "update_submission": {
      const c = node.data.config as UpdateSubmissionConfig
      const patch = {
        status: c.status || undefined,
        addTags: splitList(renderTemplate(c.addTags ?? "", scope)).map((t) => t.slice(0, 40)),
        removeTags: splitList(renderTemplate(c.removeTags ?? "", scope)),
        note: c.note ? renderTemplate(c.note, scope) : undefined,
        noteMode: c.noteMode ?? "append",
      }
      if (!env.submissionId) return { input: patch, output: { skipped: true, reason: "No submission attached to this run" } }
      if (env.isTest) return { input: patch, output: { dryRun: true, wouldApply: patch } }
      const res = await env.updateSubmission(env.submissionId, patch)
      return { input: patch, output: res }
    }
    case "chat": {
      const c = node.data.config as ChatConfig
      const url = assertSafeUrl(renderTemplate(c.webhookUrl, scope).trim(), env.allowPrivateNetwork)
      const text = renderTemplate(c.text, scope).slice(0, 3800)
      const payload = c.provider === "discord" ? { content: text.slice(0, 2000) } : { text }
      const res = await env.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      })
      const output = { status: res.status, ok: res.ok, body: await readBody(res) }
      if (!res.ok) throw new NodeExecutionError(`${c.provider === "discord" ? "Discord" : "Slack"} responded with HTTP ${res.status}`, output, { provider: c.provider, text })
      return { input: { provider: c.provider, text }, output }
    }
    case "notify": {
      const c = node.data.config as NotifyConfig
      const title = renderTemplate(c.title, scope).slice(0, 200)
      const body = renderTemplate(c.body ?? "", scope).slice(0, 2000)
      const href = renderTemplate(c.href ?? "", scope)
      const res = await env.notify({ userId: env.ownerId, title, body, href: href.startsWith("/") ? href : undefined, kind: "automation" })
      return { input: { title, body, href }, output: { notificationId: res.id } }
    }
  }
}

export { resolvePath }
