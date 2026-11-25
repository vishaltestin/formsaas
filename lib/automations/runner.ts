import "server-only"

import type { Automation, AutomationRun, Prisma } from "@/generated/prisma/client"
import { isInputField, normalizeSchema, sampleFieldValue } from "@/lib/form-engine"
import { appUrl } from "@/lib/format"
import { escapeHtml, sendEmail } from "@/lib/notify"
import { prisma } from "@/lib/prisma"
import { signValue } from "@/lib/signing"

import { advanceGraph, emptyState, normalizeState, type EngineOutcome, type ResumeInput, type StepRecord } from "./engine"
import type { ExecEnv } from "./executors"
import { hasErrors, normalizeGraph, triggerOf, validateGraph } from "./graph"
import type { AutomationGraph, TriggerKind } from "./types"

export type TriggerData = {
  event: string
  form: { id: string; title: string; slug: string }
  submission: { id: string; status: string; score: number | null; tags: string[]; notes: string | null; createdAt: string; url: string } | null
  data: Record<string, unknown>
  score: number | null
  status: string | null
  previousStatus: string | null
  [key: string]: unknown
}

const EVENT_NAMES: Record<TriggerKind, string> = {
  FORM_SUBMITTED: "submission.created",
  QUIZ_SCORE: "quiz.score",
  STATUS_CHANGED: "submission.status_changed",
  MANUAL: "automation.manual",
}

const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue))

export function tagsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : []
}

function allowPrivateNetwork() {
  return process.env.ALLOW_PRIVATE_NETWORK_REQUESTS === "true" || process.env.NODE_ENV === "test"
}

/** Trigger payload for a stored submission. */
export async function buildTriggerData(formId: string, kind: TriggerKind, opts: { submissionId?: string | null; previousStatus?: string | null; extra?: Record<string, unknown> } = {}) {
  const form = await prisma.form.findUnique({ where: { id: formId }, select: { id: true, title: true, slug: true, draftSchema: true, publishedSchema: true } })
  if (!form) throw new Error("Form not found")
  const sub = opts.submissionId ? await prisma.submission.findFirst({ where: { id: opts.submissionId, formId } }) : null
  const data: TriggerData = {
    event: EVENT_NAMES[kind],
    form: { id: form.id, title: form.title, slug: form.slug },
    submission: sub
      ? {
          id: sub.id,
          status: sub.status,
          score: sub.computedScore,
          tags: tagsOf(sub.tags),
          notes: sub.notes,
          createdAt: sub.createdAt.toISOString(),
          url: `${appUrl()}/dashboard/forms/${formId}/submissions?id=${sub.id}`,
        }
      : null,
    data: (sub?.data ?? {}) as Record<string, unknown>,
    score: sub?.computedScore ?? null,
    status: sub?.status ?? null,
    previousStatus: opts.previousStatus ?? null,
    ...(opts.extra ?? {}),
  }
  return data
}

/** Test-run payload: the latest real submission when available, otherwise realistic sample data. */
export async function sampleTriggerData(formId: string, kind: TriggerKind): Promise<{ triggerData: TriggerData; submissionId: string | null }> {
  const latest = await prisma.submission.findFirst({ where: { formId }, orderBy: { createdAt: "desc" }, select: { id: true } })
  if (latest) return { triggerData: await buildTriggerData(formId, kind, { submissionId: latest.id, previousStatus: kind === "STATUS_CHANGED" ? "NEW" : null }), submissionId: latest.id }
  const form = await prisma.form.findUniqueOrThrow({ where: { id: formId } })
  const schema = normalizeSchema(form.publishedSchema ?? form.draftSchema)
  const data = Object.fromEntries(schema.fields.filter(isInputField).map((f) => [f.key, sampleFieldValue(f)]))
  return {
    submissionId: null,
    triggerData: {
      event: EVENT_NAMES[kind],
      form: { id: form.id, title: form.title, slug: form.slug },
      submission: { id: "sub_sample", status: "NEW", score: 7, tags: [], notes: null, createdAt: new Date().toISOString(), url: `${appUrl()}/dashboard/forms/${form.id}/submissions` },
      data,
      score: 7,
      status: "NEW",
      previousStatus: kind === "STATUS_CHANGED" ? "NEW" : null,
    },
  }
}

function approvalLink(runId: string, nodeId: string) {
  return `${appUrl()}/approvals/${runId}?node=${encodeURIComponent(nodeId)}&sig=${signValue("approval", `${runId}:${nodeId}`)}`
}

export function verifyApprovalSignature(runId: string, nodeId: string, sig: string | null | undefined) {
  return !!sig && signValue("approval", `${runId}:${nodeId}`) === sig
}

function buildEnv(run: AutomationRun, automation: Automation & { form: { id: string; userId: string; workspaceId: string; title: string } }): ExecEnv {
  return {
    isTest: run.isTest,
    runId: run.id,
    formId: automation.formId,
    ownerId: automation.form.userId,
    submissionId: run.submissionId,
    allowPrivateNetwork: allowPrivateNetwork(),
    fetch: (input, init) => fetch(input, init),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async sendEmail(input) {
      const res = await sendEmail({ ...input, source: `automation:${run.id}`, workspaceId: automation.form.workspaceId })
      return { id: res.id, status: res.sent ? "SENT" : res.reason === "not-configured" ? "LOGGED" : res.reason === "no-recipients" ? "SKIPPED" : "FAILED" }
    },
    async notify(input) {
      const n = await prisma.notification.create({
        data: { userId: input.userId, title: input.title, body: input.body || null, href: input.href || `/dashboard/forms/${automation.formId}/automations?run=${run.id}`, kind: input.kind },
      })
      return { id: n.id }
    },
    async updateSubmission(submissionId, patch) {
      const sub = await prisma.submission.findFirst({ where: { id: submissionId, formId: automation.formId } })
      if (!sub) throw new Error("Submission not found")
      const tags = new Set(tagsOf(sub.tags))
      patch.addTags.forEach((t) => tags.add(t))
      patch.removeTags.forEach((t) => tags.delete(t))
      const stamp = new Date().toISOString().replace("T", " ").slice(0, 16)
      const notes = patch.note
        ? patch.noteMode === "replace"
          ? patch.note
          : [sub.notes, `[${stamp} · automation] ${patch.note}`].filter(Boolean).join("\n")
        : sub.notes
      const status = patch.status && ["NEW", "REVIEWED", "FLAGGED", "ARCHIVED"].includes(patch.status) ? (patch.status as "NEW") : sub.status
      const updated = await prisma.submission.update({ where: { id: sub.id }, data: { status, tags: Array.from(tags).slice(0, 50), notes: notes?.slice(0, 20000) ?? null } })
      return { status: updated.status, tags: tagsOf(updated.tags), notes: updated.notes }
    },
    async requestApproval(input) {
      const link = approvalLink(run.id, input.nodeId)
      const notified: string[] = []
      if (input.reviewers.length) {
        await sendEmail({
          to: input.reviewers,
          subject: `Approval needed · ${automation.form.title}`,
          html: `<p>${escapeHtml(input.message || "A submission is waiting for your approval.")}</p><p><strong>${escapeHtml(automation.name)}</strong> → ${escapeHtml(input.label)}</p><p><a href="${link}">Review and approve or reject</a></p>`,
          source: `approval:${run.id}`,
          workspaceId: automation.form.workspaceId,
        })
        notified.push(...input.reviewers)
      }
      if (input.notifyOwner) {
        await prisma.notification.create({
          data: {
            userId: automation.form.userId,
            title: `Approval needed: ${automation.name}`,
            body: input.message || null,
            href: `/dashboard/forms/${automation.formId}/automations?run=${run.id}`,
            kind: "approval",
          },
        })
        notified.push("owner")
      }
      return { notified }
    },
  }
}

const delayTimers = new Set<string>()
function scheduleDelaySweep(runId: string, resumeAt: Date) {
  const ms = resumeAt.getTime() - Date.now()
  if (ms > 15 * 60_000 || delayTimers.has(runId)) return
  delayTimers.add(runId)
  const t = setTimeout(() => {
    delayTimers.delete(runId)
    void processDueRuns().catch((e) => console.error("[automations] delay sweep failed", e))
  }, Math.max(0, ms) + 250)
  t.unref?.()
}

async function persistOutcome(runId: string, startedAt: Date, outcome: EngineOutcome, state: unknown) {
  const finished = outcome.status === "SUCCEEDED" || outcome.status === "FAILED"
  const now = new Date()
  return prisma.automationRun.update({
    where: { id: runId },
    data: {
      status: outcome.status,
      context: json(state),
      error: outcome.status === "FAILED" ? outcome.error.slice(0, 4000) : null,
      waitingNodeId: outcome.status === "WAITING_APPROVAL" || outcome.status === "WAITING_DELAY" ? outcome.nodeId : null,
      resumeAt: outcome.status === "WAITING_DELAY" ? outcome.resumeAt : null,
      finishedAt: finished ? now : null,
      durationMs: finished ? now.getTime() - startedAt.getTime() : null,
    },
  })
}

/** Executes (or resumes) a run until it finishes or pauses. The run must be in RUNNING state. */
async function continueRun(runId: string, resume?: ResumeInput) {
  const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId }, include: { automation: { include: { form: { select: { id: true, userId: true, workspaceId: true, title: true } } } } } })
  const graph = normalizeGraph(run.graph)
  const env = buildEnv(run, run.automation)
  const onStep = async (s: StepRecord) => {
    const data = {
      status: s.status,
      input: json(s.input),
      output: json(s.output),
      error: s.error ?? null,
      attempt: s.attempt,
      finishedAt: s.finishedAt,
      durationMs: s.durationMs,
    }
    if (s.resumed) {
      const waiting = await prisma.automationRunStep.findFirst({ where: { runId, nodeId: s.nodeId, status: "WAITING" }, orderBy: { startedAt: "desc" } })
      if (waiting) {
        await prisma.automationRunStep.update({
          where: { id: waiting.id },
          data: { ...data, durationMs: Date.now() - waiting.startedAt.getTime(), finishedAt: new Date() },
        })
        return
      }
    }
    await prisma.automationRunStep.create({ data: { runId, nodeId: s.nodeId, nodeType: s.nodeType, label: s.label, startedAt: s.startedAt, ...data } })
  }
  let result: Awaited<ReturnType<typeof advanceGraph>>
  try {
    result = await advanceGraph(graph, normalizeState(run.context), { trigger: run.triggerData, run: { id: run.id, isTest: run.isTest } }, env, onStep, resume)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Run crashed"
    return persistOutcome(runId, run.startedAt, { status: "FAILED", error: message, nodeId: "" }, run.context)
  }
  const saved = await persistOutcome(runId, run.startedAt, result.outcome, result.state)
  if (result.outcome.status === "WAITING_DELAY") scheduleDelaySweep(runId, result.outcome.resumeAt)
  return saved
}

export async function startRun(input: {
  automation: Automation
  triggerType: TriggerKind
  triggerData: TriggerData
  submissionId?: string | null
  isTest?: boolean
  replayOfId?: string | null
  graph?: AutomationGraph
}) {
  const graph = input.graph ?? normalizeGraph(input.automation.graph)
  const run = await prisma.automationRun.create({
    data: {
      automationId: input.automation.id,
      submissionId: input.submissionId ?? null,
      status: "RUNNING",
      isTest: input.isTest ?? false,
      triggerType: input.triggerType,
      triggerData: json(input.triggerData)!,
      graph: json(graph)!,
      context: json(emptyState())!,
      replayOfId: input.replayOfId ?? null,
    },
  })
  return continueRun(run.id)
}

function triggerMatches(graph: AutomationGraph, kind: TriggerKind, data: TriggerData) {
  const trigger = triggerOf(graph)
  if (!trigger || trigger.data.config.kind !== kind) return false
  const c = trigger.data.config
  if (kind === "QUIZ_SCORE") {
    if (data.score === null || data.score === undefined) return false
    const t = Number(c.scoreThreshold ?? 0)
    const s = Number(data.score)
    switch (c.scoreOperator ?? "gte") {
      case "gt":
        return s > t
      case "lt":
        return s < t
      case "lte":
        return s <= t
      case "equals":
        return s === t
      default:
        return s >= t
    }
  }
  if (kind === "STATUS_CHANGED" && c.toStatus) return data.status === c.toStatus
  return true
}

/** Fires every enabled automation of a form listening to `kind`. Never throws. */
export async function dispatchAutomationTrigger(formId: string, kind: TriggerKind, opts: { submissionId?: string | null; previousStatus?: string | null } = {}) {
  try {
    const automations = await prisma.automation.findMany({ where: { formId, enabled: true, trigger: kind } })
    if (automations.length === 0) return []
    const triggerData = await buildTriggerData(formId, kind, opts)
    const runs: AutomationRun[] = []
    for (const a of automations) {
      const graph = normalizeGraph(a.graph)
      if (hasErrors(validateGraph(graph)) || !triggerMatches(graph, kind, triggerData)) continue
      runs.push(await startRun({ automation: a, triggerType: kind, triggerData, submissionId: opts.submissionId ?? null, graph }))
    }
    return runs
  } catch (e) {
    console.error("[automations] dispatch failed", e)
    return []
  } finally {
    void processDueRuns().catch(() => undefined)
  }
}

/** Resumes delayed runs whose time has come. Safe to call concurrently (atomic claim). */
export async function processDueRuns(limit = 25) {
  const due = await prisma.automationRun.findMany({
    where: { status: "WAITING_DELAY", resumeAt: { lte: new Date() } },
    orderBy: { resumeAt: "asc" },
    take: limit,
    select: { id: true, waitingNodeId: true, resumeAt: true },
  })
  let resumed = 0
  for (const r of due) {
    const claimed = await prisma.automationRun.updateMany({ where: { id: r.id, status: "WAITING_DELAY" }, data: { status: "RUNNING" } })
    if (claimed.count !== 1 || !r.waitingNodeId) continue
    await continueRun(r.id, { nodeId: r.waitingNodeId, output: { resumedAt: new Date().toISOString(), waitedMs: r.resumeAt ? Date.now() - r.resumeAt.getTime() : 0 } })
    resumed++
  }
  return resumed
}

export class ApprovalError extends Error {}

export async function decideApproval(runId: string, decision: "approved" | "rejected", reviewer: string, comment?: string) {
  const run = await prisma.automationRun.findUnique({ where: { id: runId }, select: { status: true, waitingNodeId: true } })
  if (!run || run.status !== "WAITING_APPROVAL" || !run.waitingNodeId) throw new ApprovalError("This approval request is no longer pending.")
  const claimed = await prisma.automationRun.updateMany({ where: { id: runId, status: "WAITING_APPROVAL" }, data: { status: "RUNNING" } })
  if (claimed.count !== 1) throw new ApprovalError("This approval request was already decided.")
  return continueRun(runId, {
    nodeId: run.waitingNodeId,
    branch: decision,
    output: { decision, reviewer: reviewer.slice(0, 200), comment: (comment ?? "").slice(0, 2000), decidedAt: new Date().toISOString() },
  })
}

export async function cancelRun(runId: string) {
  const res = await prisma.automationRun.updateMany({
    where: { id: runId, status: { in: ["WAITING_APPROVAL", "WAITING_DELAY"] } },
    data: { status: "CANCELLED", finishedAt: new Date(), waitingNodeId: null, resumeAt: null },
  })
  if (res.count) await prisma.automationRunStep.updateMany({ where: { runId, status: "WAITING" }, data: { status: "SKIPPED", finishedAt: new Date(), error: "Run cancelled" } })
  return res.count === 1
}

export async function replayRun(runId: string, mode: "latest" | "snapshot" = "latest") {
  const original = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId }, include: { automation: true } })
  const graph = mode === "snapshot" ? normalizeGraph(original.graph) : normalizeGraph(original.automation.graph)
  if (hasErrors(validateGraph(graph))) throw new Error("Fix the automation's validation errors before replaying.")
  return startRun({
    automation: original.automation,
    triggerType: original.triggerType as TriggerKind,
    triggerData: original.triggerData as TriggerData,
    submissionId: original.submissionId,
    isTest: original.isTest,
    replayOfId: original.id,
    graph,
  })
}

/** Manual / API trigger with optional submission or custom data. */
export async function triggerManually(automation: Automation, input: { submissionId?: string | null; data?: Record<string, unknown> }) {
  const graph = normalizeGraph(automation.graph)
  const issues = validateGraph(graph)
  if (hasErrors(issues)) throw new Error(issues.find((i) => i.severity === "error")!.message)
  const base = await buildTriggerData(automation.formId, "MANUAL", { submissionId: input.submissionId ?? null })
  if (input.submissionId && !base.submission) throw new Error("Submission not found for this form")
  const triggerData: TriggerData = { ...base, data: { ...base.data, ...(input.data ?? {}) } }
  return startRun({ automation, triggerType: "MANUAL", triggerData, submissionId: base.submission?.id ?? null, graph })
}

export async function getRunWithSteps(runId: string) {
  return prisma.automationRun.findUnique({ where: { id: runId }, include: { steps: { orderBy: { startedAt: "asc" } } } })
}

/**
 * In-process sweeper for delayed runs (long-lived `next start` servers).
 * Delays ≤15 min are also scheduled precisely via timers, and
 * /api/cron/automations lets an external scheduler drive it on serverless.
 */
const SWEEPER_KEY = Symbol.for("formstudio.automationSweeper")
function ensureSweeper() {
  const g = globalThis as unknown as Record<symbol, unknown>
  if (g[SWEEPER_KEY] || process.env.NEXT_PHASE === "phase-production-build" || process.env.NODE_ENV === "test") return
  const timer = setInterval(() => {
    void processDueRuns().catch((e) => console.error("[automations] sweep failed", e instanceof Error ? e.message : e))
  }, 30_000)
  timer.unref?.()
  g[SWEEPER_KEY] = timer
}
ensureSweeper()
