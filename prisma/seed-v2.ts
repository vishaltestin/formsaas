/**
 * v2 demo data: automations with realistic run history (executed through the
 * real DAG engine with a sandboxed environment), API keys, request logs and
 * in-app notifications. Called from prisma/seed.ts; safe to re-run.
 */
import { createHash } from "node:crypto"

import type { PrismaClient } from "../generated/prisma/client"
import { hashApiKey, keyPrefix } from "../lib/api/keys"
import { advanceGraph, emptyState, type RunState, type StepRecord } from "../lib/automations/engine"
import type { ExecEnv } from "../lib/automations/executors"
import { defaultNodeConfig, type AutomationGraph } from "../lib/automations/types"

/** Documented demo key (README) — full access, Pro workspace. */
export const DEMO_API_KEY = "fs_live_demo0000000000000000000000000000"

type Rand = () => number

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as object

export function leadRoutingGraph(): AutomationGraph {
  return {
    nodes: [
      { id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Form submitted", config: defaultNodeConfig("trigger") } },
      {
        id: "if_1",
        type: "condition",
        position: { x: 0, y: 170 },
        data: { label: "Enterprise lead?", config: { match: "all", rules: [{ left: "{{trigger.data.lead_tier}}", op: "equals", right: "enterprise" }] } },
      },
      {
        id: "approval_1",
        type: "approval",
        position: { x: -260, y: 360 },
        data: {
          label: "Sales approval",
          config: { reviewers: "demo@formstudio.dev", message: "Enterprise lead from {{trigger.data.company}} ({{trigger.data.work_email}}). Approve to sync to the CRM.", notifyOwner: true },
        },
      },
      {
        id: "http_1",
        type: "http",
        position: { x: -400, y: 560 },
        data: {
          label: "Create CRM lead",
          config: {
            ...defaultNodeConfig("http"),
            url: "https://httpbin.org/anything/crm/leads",
            body: '{\n  "email": "{{trigger.data.work_email}}",\n  "company": "{{trigger.data.company}}",\n  "seats": "{{trigger.data.seats | "0"}}",\n  "approvedBy": "{{nodes.approval_1.reviewer}}"\n}',
            auth: "bearer",
            authToken: "crm_demo_token",
            hmacSecret: "whsec_demo_crm",
            retries: 2,
          },
        },
      },
      {
        id: "notify_1",
        type: "notify",
        position: { x: -400, y: 750 },
        data: { label: "Notify owner", config: { title: "CRM lead created for {{trigger.data.company}}", body: "CRM status {{nodes.http_1.status}} · approved by {{nodes.approval_1.reviewer}}", href: "" } },
      },
      {
        id: "update_2",
        type: "update_submission",
        position: { x: -120, y: 560 },
        data: { label: "Mark declined", config: { status: "ARCHIVED", addTags: "declined", removeTags: "", note: "Declined by {{nodes.approval_1.reviewer}}: {{nodes.approval_1.comment | \"no comment\"}}", noteMode: "append" } },
      },
      {
        id: "transform_1",
        type: "transform",
        position: { x: 260, y: 360 },
        data: {
          label: "Build nurture payload",
          config: {
            mappings: [
              { key: "fullName", value: "{{trigger.data.first_name}} {{trigger.data.last_name}}", type: "string" },
              { key: "seats", value: "{{trigger.data.seats | \"0\"}}", type: "number" },
            ],
          },
        },
      },
      {
        id: "update_1",
        type: "update_submission",
        position: { x: 260, y: 560 },
        data: { label: "Tag nurture", config: { status: "REVIEWED", addTags: "nurture", removeTags: "", note: "Added to nurture for {{nodes.transform_1.fullName}}", noteMode: "append" } },
      },
    ],
    edges: [
      { id: "e1", source: "trigger_1", target: "if_1" },
      { id: "e2", source: "if_1", target: "approval_1", sourceHandle: "true" },
      { id: "e3", source: "if_1", target: "transform_1", sourceHandle: "false" },
      { id: "e4", source: "approval_1", target: "http_1", sourceHandle: "approved" },
      { id: "e5", source: "http_1", target: "notify_1" },
      { id: "e6", source: "approval_1", target: "update_2", sourceHandle: "rejected" },
      { id: "e7", source: "transform_1", target: "update_1" },
    ],
  }
}

function escalationGraph(): AutomationGraph {
  return {
    nodes: [
      { id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Manual / API", config: { ...defaultNodeConfig("trigger"), kind: "MANUAL" } } },
      {
        id: "if_1",
        type: "condition",
        position: { x: 0, y: 170 },
        data: { label: "Urgent?", config: { match: "any", rules: [{ left: "{{trigger.data.priority}}", op: "equals", right: "urgent" }] } },
      },
      {
        id: "update_1",
        type: "update_submission",
        position: { x: -200, y: 360 },
        data: { label: "Flag ticket", config: { status: "FLAGGED", addTags: "escalated", removeTags: "", note: "Escalated via API", noteMode: "append" } },
      },
      { id: "notify_1", type: "notify", position: { x: -200, y: 550 }, data: { label: "Page on-call", config: { title: "Urgent ticket from {{trigger.data.company}}", body: "{{trigger.data.message}}", href: "" } } },
      {
        id: "update_2",
        type: "update_submission",
        position: { x: 200, y: 360 },
        data: { label: "Mark reviewed", config: { status: "REVIEWED", addTags: "triaged", removeTags: "", note: "", noteMode: "append" } },
      },
    ],
    edges: [
      { id: "e1", source: "trigger_1", target: "if_1" },
      { id: "e2", source: "if_1", target: "update_1", sourceHandle: "true" },
      { id: "e3", source: "update_1", target: "notify_1" },
      { id: "e4", source: "if_1", target: "update_2", sourceHandle: "false" },
    ],
  }
}

function sandboxEnv(rand: Rand, submission: { id: string; status: string; tags: string[]; notes: string | null }, crmFails: boolean): ExecEnv {
  const state = { ...submission }
  return {
    isTest: false,
    runId: "seed",
    formId: "seed",
    ownerId: "seed",
    submissionId: submission.id,
    allowPrivateNetwork: false,
    fetch: (async () =>
      crmFails
        ? new Response("upstream timeout", { status: 503, headers: { "content-type": "text/plain" } })
        : new Response(JSON.stringify({ id: `lead_${Math.floor(rand() * 1e8).toString(36)}`, created: true }), {
            status: 201,
            headers: { "content-type": "application/json", "x-request-id": `req_${Math.floor(rand() * 1e10).toString(36)}` },
          })) as typeof fetch,
    sleep: async () => {},
    sendEmail: async () => ({ id: null, status: "LOGGED" }),
    notify: async () => ({ id: `ntf_${Math.floor(rand() * 1e8).toString(36)}` }),
    updateSubmission: async (_id, patch) => {
      const tags = new Set(state.tags)
      patch.addTags.forEach((t) => tags.add(t))
      patch.removeTags.forEach((t) => tags.delete(t))
      if (patch.status) state.status = patch.status
      state.tags = [...tags]
      if (patch.note) state.notes = [state.notes, `[automation] ${patch.note}`].filter(Boolean).join("\n")
      return { status: state.status, tags: state.tags, notes: state.notes }
    },
    requestApproval: async ({ reviewers }) => ({ notified: [...reviewers, "owner"] }),
  }
}

async function recordRun(
  prisma: PrismaClient,
  opts: {
    automationId: string
    graph: AutomationGraph
    trigger: Record<string, unknown>
    submission: { id: string; status: string; tags: string[]; notes: string | null }
    startedAt: Date
    rand: Rand
    decision?: { decision: "approved" | "rejected"; reviewer: string; comment: string; afterMs: number } | null
    crmFails?: boolean
    triggerType: "FORM_SUBMITTED" | "MANUAL"
  }
) {
  const steps: StepRecord[] = []
  let clock = opts.startedAt.getTime()
  const onStep = (s: StepRecord) => {
    // Re-time steps onto the seeded timeline with plausible latencies.
    const latency = s.nodeType === "http" ? 120 + Math.floor(opts.rand() * 600) : 2 + Math.floor(opts.rand() * 25)
    const started = new Date(clock)
    clock += latency
    steps.push({ ...s, startedAt: started, finishedAt: s.status === "WAITING" ? null : new Date(clock), durationMs: s.status === "WAITING" ? null : latency })
  }
  const env = sandboxEnv(opts.rand, opts.submission, !!opts.crmFails)
  const scope = { trigger: opts.trigger, run: { id: "seed", isTest: false } }
  let { state, outcome } = await advanceGraph(opts.graph, emptyState(), scope, env, onStep)
  if (outcome.status === "WAITING_APPROVAL" && opts.decision) {
    const waitingIdx = steps.findIndex((s) => s.status === "WAITING")
    clock += opts.decision.afterMs
    const decidedAt = new Date(clock).toISOString()
    const resumed = await advanceGraph(
      opts.graph,
      state,
      scope,
      env,
      (s) => {
        if (s.resumed && waitingIdx >= 0) {
          const w = steps[waitingIdx]
          steps[waitingIdx] = { ...w, status: "SUCCEEDED", output: s.output, finishedAt: new Date(clock), durationMs: clock - w.startedAt.getTime() }
          return
        }
        onStep(s)
      },
      { nodeId: outcome.nodeId, branch: opts.decision.decision, output: { decision: opts.decision.decision, reviewer: opts.decision.reviewer, comment: opts.decision.comment, decidedAt } }
    )
    state = resumed.state
    outcome = resumed.outcome
  }
  const finished = outcome.status === "SUCCEEDED" || outcome.status === "FAILED"
  const run = await prisma.automationRun.create({
    data: {
      automationId: opts.automationId,
      submissionId: opts.submission.id,
      status: outcome.status,
      triggerType: opts.triggerType,
      triggerData: json(opts.trigger),
      graph: json(opts.graph),
      context: json(state satisfies RunState),
      error: outcome.status === "FAILED" ? outcome.error : null,
      waitingNodeId: outcome.status === "WAITING_APPROVAL" ? outcome.nodeId : null,
      startedAt: opts.startedAt,
      finishedAt: finished ? new Date(clock) : null,
      durationMs: finished ? clock - opts.startedAt.getTime() : null,
      steps: {
        create: steps.map((s) => ({
          nodeId: s.nodeId,
          nodeType: s.nodeType,
          label: s.label,
          status: s.status,
          input: s.input === undefined ? undefined : json(s.input),
          output: s.output === undefined ? undefined : json(s.output),
          error: s.error ?? null,
          attempt: s.attempt,
          startedAt: s.startedAt,
          finishedAt: s.finishedAt,
          durationMs: s.durationMs,
        })),
      },
    },
  })
  return { run, outcome, submission: env }
}

export async function seedV2(
  prisma: PrismaClient,
  ctx: { rand: Rand; demoUserId: string; demoWorkspaceId: string; leadFormId: string; contactFormId: string; appUrl: string }
) {
  const { rand, demoUserId } = ctx
  const between = (a: number, b: number) => Math.floor(a + rand() * (b - a + 1))
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]

  // ── Automations ────────────────────────────────────────────
  const [leadForm, contactForm] = await Promise.all([
    prisma.form.findUniqueOrThrow({ where: { id: ctx.leadFormId }, select: { id: true, title: true, slug: true } }),
    prisma.form.findUniqueOrThrow({ where: { id: ctx.contactFormId }, select: { id: true, title: true, slug: true } }),
  ])
  const routing = await prisma.automation.create({
    data: {
      formId: leadForm.id,
      name: "Lead routing with approval",
      description: "Enterprise leads wait for sales approval before syncing to the CRM; everyone else is tagged for nurture.",
      enabled: true,
      trigger: "FORM_SUBMITTED",
      graph: json(leadRoutingGraph()),
    },
  })
  const escalation = await prisma.automation.create({
    data: {
      formId: contactForm.id,
      name: "Escalate ticket",
      description: "Triggered from the API or the canvas. Urgent tickets are flagged and page the on-call owner.",
      enabled: true,
      trigger: "MANUAL",
      graph: json(escalationGraph()),
    },
  })

  const leadSubs = await prisma.submission.findMany({ where: { formId: leadForm.id }, orderBy: { createdAt: "asc" } })
  let waiting = 0
  let failed = 0
  for (const [i, sub] of leadSubs.entries()) {
    const data = (sub.data ?? {}) as Record<string, unknown>
    const isRecent = i >= leadSubs.length - 3
    const enterprise = data.lead_tier === "enterprise"
    const trigger = {
      event: "submission.created",
      form: leadForm,
      submission: { id: sub.id, status: sub.status, score: sub.computedScore, tags: [], notes: sub.notes, createdAt: sub.createdAt.toISOString(), url: `${ctx.appUrl}/dashboard/forms/${leadForm.id}/submissions?id=${sub.id}` },
      data,
      score: sub.computedScore,
      status: sub.status,
      previousStatus: null,
    }
    const decision = enterprise && !isRecent ? { decision: rand() < 0.75 ? ("approved" as const) : ("rejected" as const), reviewer: "demo@formstudio.dev", comment: pick(["Good fit", "Budget confirmed", "Not ICP", "Duplicate account", ""]), afterMs: between(5, 600) * 60_000 } : null
    const crmFails = !!decision && decision.decision === "approved" && failed === 0 && i > 4
    const { outcome, submission } = await recordRun(prisma, {
      automationId: routing.id,
      graph: leadRoutingGraph(),
      trigger,
      submission: { id: sub.id, status: sub.status, tags: [], notes: sub.notes },
      startedAt: new Date(sub.createdAt.getTime() + 400),
      rand,
      decision,
      crmFails,
      triggerType: "FORM_SUBMITTED",
    })
    if (outcome.status === "WAITING_APPROVAL") waiting++
    if (outcome.status === "FAILED") failed++
    // Persist the side effects the sandboxed update_submission node produced.
    const probe = await submission.updateSubmission(sub.id, { addTags: [], removeTags: [], noteMode: "append" })
    await prisma.submission.update({ where: { id: sub.id }, data: { status: probe.status as "NEW", tags: probe.tags, notes: probe.notes } })
  }

  const contactSubs = await prisma.submission.findMany({ where: { formId: contactForm.id }, orderBy: { createdAt: "desc" }, take: 4 })
  for (const sub of contactSubs) {
    const data = (sub.data ?? {}) as Record<string, unknown>
    await recordRun(prisma, {
      automationId: escalation.id,
      graph: escalationGraph(),
      trigger: { event: "automation.manual", form: contactForm, submission: { id: sub.id, status: sub.status, score: null, tags: [], notes: null, createdAt: sub.createdAt.toISOString(), url: "" }, data, score: null, status: sub.status, previousStatus: null, source: "api" },
      submission: { id: sub.id, status: sub.status, tags: [], notes: sub.notes },
      startedAt: new Date(sub.createdAt.getTime() + between(2, 90) * 60_000),
      rand,
      triggerType: "MANUAL",
    })
  }

  // ── API keys & request logs ────────────────────────────────
  await prisma.apiRequestLog.deleteMany({ where: { userId: demoUserId } })
  await prisma.apiKey.deleteMany({ where: { userId: demoUserId } })
  const now = Date.now()
  const prod = await prisma.apiKey.create({
    data: {
      userId: demoUserId,
      workspaceId: ctx.demoWorkspaceId,
      name: "Demo key (README)",
      prefix: keyPrefix(DEMO_API_KEY),
      hash: hashApiKey(DEMO_API_KEY),
      scopes: ["forms:read", "forms:write", "submissions:read", "submissions:write", "automations:trigger", "analytics:read"],
      rateLimit: 120,
      lastUsedAt: new Date(now - 12 * 60_000),
      createdAt: new Date(now - 20 * 86400000),
    },
  })
  const randomKey = () => `fs_live_${createHash("sha256").update(String(rand())).digest("base64url").slice(0, 32)}`
  const ciRaw = randomKey()
  const ci = await prisma.apiKey.create({
    data: {
      userId: demoUserId,
      workspaceId: ctx.demoWorkspaceId,
      name: "Warehouse sync (read-only)",
      prefix: keyPrefix(ciRaw),
      hash: hashApiKey(ciRaw),
      scopes: ["submissions:read", "analytics:read"],
      rateLimit: 60,
      expiresAt: new Date(now + 60 * 86400000),
      lastUsedAt: new Date(now - 3 * 3600_000),
      createdAt: new Date(now - 9 * 86400000),
    },
  })
  const oldRaw = randomKey()
  await prisma.apiKey.create({
    data: {
      userId: demoUserId,
      workspaceId: ctx.demoWorkspaceId,
      name: "Zapier (rotated)",
      prefix: keyPrefix(oldRaw),
      hash: hashApiKey(oldRaw),
      scopes: ["submissions:write"],
      rateLimit: 120,
      revokedAt: new Date(now - 6 * 86400000),
      lastUsedAt: new Date(now - 6 * 86400000 - 3600_000),
      createdAt: new Date(now - 28 * 86400000),
    },
  })

  const ROUTES: { method: string; path: string; ok: number; key: "prod" | "ci" }[] = [
    { method: "GET", path: "/api/v1/forms", ok: 200, key: "prod" },
    { method: "GET", path: `/api/v1/forms/${leadForm.id}`, ok: 200, key: "prod" },
    { method: "GET", path: `/api/v1/forms/${leadForm.id}/submissions?limit=50`, ok: 200, key: "ci" },
    { method: "GET", path: `/api/v1/forms/${leadForm.id}/analytics?days=30`, ok: 200, key: "ci" },
    { method: "POST", path: `/api/v1/forms/${contactForm.id}/submissions`, ok: 201, key: "prod" },
    { method: "POST", path: `/api/v1/automations/${escalation.id}/trigger`, ok: 202, key: "prod" },
    { method: "PATCH", path: `/api/v1/submissions/${contactSubs[0]?.id ?? "sub"}`, ok: 200, key: "prod" },
    { method: "GET", path: "/api/v1/me", ok: 200, key: "prod" },
  ]
  const FAILURES = [
    { status: 422, error: "invalid_request: email: Enter a valid email address" },
    { status: 404, error: "not_found: Submission not found" },
    { status: 403, error: "insufficient_scope: This key is missing the forms:write scope" },
    { status: 429, error: "rate_limited: Rate limit of 120 requests per minute exceeded" },
    { status: 409, error: "idempotency_in_progress: A request with this Idempotency-Key is still being processed" },
  ]
  const logs = Array.from({ length: 180 }, () => {
    const r = pick(ROUTES)
    const fail = rand() < 0.1 ? pick(FAILURES) : null
    const createdAt = new Date(now - Math.floor(rand() * 7 * 86400000))
    const base = r.method === "GET" ? between(18, 140) : between(60, 420)
    return {
      userId: demoUserId,
      apiKeyId: r.key === "prod" ? prod.id : ci.id,
      method: r.method,
      path: r.path,
      status: fail?.status ?? r.ok,
      durationMs: fail ? between(4, 40) : rand() < 0.04 ? between(900, 2400) : base,
      ip: `203.0.113.${between(2, 250)}`,
      error: fail?.error ?? null,
      createdAt,
    }
  })
  await prisma.apiRequestLog.createMany({ data: logs })

  // ── Notifications ──────────────────────────────────────────
  await prisma.notification.deleteMany({ where: { userId: demoUserId } })
  const firstWaiting = await prisma.automationRun.findFirst({ where: { automationId: routing.id, status: "WAITING_APPROVAL" }, orderBy: { startedAt: "desc" } })
  const firstFailed = await prisma.automationRun.findFirst({ where: { automationId: routing.id, status: "FAILED" } })
  await prisma.notification.createMany({
    data: [
      ...(firstWaiting
        ? [{ userId: demoUserId, title: "Approval needed: Lead routing with approval", body: "An enterprise lead is waiting for sales approval.", href: `/dashboard/forms/${leadForm.id}/automations?run=${firstWaiting.id}`, kind: "approval", createdAt: firstWaiting.startedAt }]
        : []),
      ...(firstFailed
        ? [{ userId: demoUserId, title: "Automation run failed", body: firstFailed.error ?? "A step failed", href: `/dashboard/forms/${leadForm.id}/automations?run=${firstFailed.id}`, kind: "error", createdAt: firstFailed.startedAt }]
        : []),
      { userId: demoUserId, title: "API key revoked", body: "Zapier (rotated) can no longer access the API.", href: "/dashboard/developers?tab=keys", kind: "info", createdAt: new Date(now - 6 * 86400000), readAt: new Date(now - 6 * 86400000) },
      { userId: demoUserId, title: "Webhook delivery failed", body: "CRM sync returned HTTP 502.", href: "/dashboard/developers?tab=webhooks", kind: "warning", createdAt: new Date(now - 2 * 86400000) },
    ],
  })

  return { automations: 2, runs: await prisma.automationRun.count(), waitingApprovals: waiting, apiKeys: 3, apiLogs: logs.length }
}
