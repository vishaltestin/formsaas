import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { leadRoutingGraph } from "../../prisma/seed-v2"
import { advanceGraph, emptyState, type StepRecord } from "../../lib/automations/engine"
import { assertSafeUrl, evaluateCondition, hmacSignature, type ExecEnv } from "../../lib/automations/executors"
import { findCycle, hasErrors, topologicalOrder, validateGraph, wouldCreateCycle } from "../../lib/automations/graph"
import { extractTokens, renderJsonTemplate, renderTemplate } from "../../lib/automations/template"
import { defaultNodeConfig, type AutomationGraph } from "../../lib/automations/types"

function env(overrides: Partial<ExecEnv> = {}) {
  const calls = { fetch: [] as { url: string; init: RequestInit }[], notify: 0, updates: [] as unknown[], approvals: 0, emails: 0 }
  const e: ExecEnv = {
    isTest: false,
    runId: "run_test",
    formId: "form_test",
    ownerId: "user_test",
    submissionId: "sub_test",
    allowPrivateNetwork: false,
    fetch: (async (url: URL | string, init: RequestInit) => {
      calls.fetch.push({ url: String(url), init })
      return new Response(JSON.stringify({ id: "crm_1" }), { status: 201, headers: { "content-type": "application/json" } })
    }) as typeof fetch,
    sleep: async () => {},
    sendEmail: async () => {
      calls.emails++
      return { id: "em_1", status: "LOGGED" }
    },
    notify: async () => {
      calls.notify++
      return { id: "n_1" }
    },
    updateSubmission: async (_id, patch) => {
      calls.updates.push(patch)
      return { status: patch.status ?? "NEW", tags: patch.addTags, notes: patch.note ?? null }
    },
    requestApproval: async () => {
      calls.approvals++
      return { notified: ["owner"] }
    },
    ...overrides,
  }
  return { env: e, calls }
}

const scopeFor = (data: Record<string, unknown>) => ({ trigger: { data, form: { id: "f", title: "Leads", slug: "leads" } }, run: { id: "r", isTest: false } })

async function run(graph: AutomationGraph, data: Record<string, unknown>, e: ExecEnv) {
  const steps: StepRecord[] = []
  const res = await advanceGraph(graph, emptyState(), scopeFor(data), e, (s) => void steps.push(s))
  return { ...res, steps }
}

describe("DAG validation", () => {
  it("accepts the seeded lead-routing graph", () => {
    assert.equal(hasErrors(validateGraph(leadRoutingGraph())), false)
  })

  it("detects cycles and prevents connecting one", () => {
    const g = leadRoutingGraph()
    assert.equal(findCycle(g), null)
    assert.equal(wouldCreateCycle(g, "notify_1", "if_1"), true)
    assert.equal(wouldCreateCycle(g, "if_1", "notify_1"), false)
    const cyclic: AutomationGraph = { ...g, edges: [...g.edges, { id: "back", source: "notify_1", target: "if_1" }] }
    assert.ok(findCycle(cyclic))
    assert.ok(validateGraph(cyclic).some((i) => /loop/.test(i.message)))
  })

  it("requires exactly one trigger and branch handles on routers", () => {
    const g = leadRoutingGraph()
    const noTrigger = { nodes: g.nodes.filter((n) => n.type !== "trigger"), edges: [] }
    assert.ok(hasErrors(validateGraph(noTrigger)))
    const badHandle: AutomationGraph = { ...g, edges: g.edges.map((e) => (e.id === "e2" ? { ...e, sourceHandle: undefined } : e)) }
    assert.ok(validateGraph(badHandle).some((i) => /handle/.test(i.message)))
  })

  it("orders nodes topologically", () => {
    const order = topologicalOrder(leadRoutingGraph())
    assert.ok(order.indexOf("trigger_1") < order.indexOf("if_1"))
    assert.ok(order.indexOf("approval_1") < order.indexOf("http_1"))
  })
})

describe("templates", () => {
  it("resolves dotted paths, indexes and fallbacks", () => {
    const scope = { trigger: { data: { email: "a@b.co", tags: ["x", "y"] } }, nodes: { http_1: { body: { id: 42 } } } }
    assert.equal(renderTemplate("{{trigger.data.email}} {{nodes.http_1.body.id}} {{trigger.data.tags[1]}}", scope), "a@b.co 42 y")
    assert.equal(renderTemplate('Hi {{trigger.data.name | "there"}}', scope), "Hi there")
    assert.deepEqual(extractTokens("{{a.b}} and {{c}}"), ["a.b", "c"])
  })
  it("blocks prototype access", () => {
    assert.equal(renderTemplate("{{trigger.__proto__.constructor}}", { trigger: {} }), "")
  })
  it("JSON-escapes values inside JSON bodies", () => {
    const out = renderJsonTemplate('{"name":"{{trigger.data.name}}"}', { trigger: { data: { name: 'Ada "Q" \n' } } })
    assert.deepEqual(JSON.parse(out), { name: 'Ada "Q" \n' })
  })
})

describe("IF/ELSE branching", () => {
  it("evaluates all/any rule sets", () => {
    const scope = { trigger: { data: { n: 12, plan: "pro" } } }
    assert.equal(evaluateCondition({ match: "all", rules: [{ left: "{{trigger.data.n}}", op: "gt", right: "10" }, { left: "{{trigger.data.plan}}", op: "equals", right: "pro" }] }, scope).result, true)
    assert.equal(evaluateCondition({ match: "all", rules: [{ left: "{{trigger.data.n}}", op: "gt", right: "20" }, { left: "{{trigger.data.plan}}", op: "equals", right: "pro" }] }, scope).result, false)
    assert.equal(evaluateCondition({ match: "any", rules: [{ left: "{{trigger.data.n}}", op: "gt", right: "20" }, { left: "{{trigger.data.plan}}", op: "equals", right: "pro" }] }, scope).result, true)
  })

  it("follows only the false branch for non-enterprise leads", async () => {
    const { env: e, calls } = env()
    const r = await run(leadRoutingGraph(), { lead_tier: "self-serve", first_name: "Ada", last_name: "L", seats: "7" }, e)
    assert.equal(r.outcome.status, "SUCCEEDED")
    const ids = r.steps.map((s) => s.nodeId)
    assert.deepEqual(ids, ["trigger_1", "if_1", "transform_1", "update_1"])
    assert.deepEqual(r.state.nodes.transform_1, { fullName: "Ada L", seats: 7 })
    assert.equal(calls.approvals, 0)
    assert.equal(calls.fetch.length, 0)
  })
})

describe("human approval gate", () => {
  it("pauses in WAITING_APPROVAL, then resumes on approve and captures the HTTP response", async () => {
    const { env: e, calls } = env()
    const g = leadRoutingGraph()
    const data = { lead_tier: "enterprise", work_email: "cto@globex.com", company: "Globex" }
    const first = await run(g, data, e)
    assert.equal(first.outcome.status, "WAITING_APPROVAL")
    assert.equal(calls.approvals, 1)
    assert.equal(first.steps.at(-1)?.status, "WAITING")

    const steps: StepRecord[] = []
    const resumed = await advanceGraph(g, first.state, scopeFor(data), e, (s) => void steps.push(s), {
      nodeId: "approval_1",
      branch: "approved",
      output: { decision: "approved", reviewer: "sam@globex.com", comment: "ok", decidedAt: new Date().toISOString() },
    })
    assert.equal(resumed.outcome.status, "SUCCEEDED")
    assert.deepEqual(steps.map((s) => s.nodeId), ["approval_1", "http_1", "notify_1"])
    assert.equal(steps[0].resumed, true)
    const http = resumed.state.nodes.http_1 as { status: number; body: { id: string } }
    assert.equal(http.status, 201)
    assert.equal(http.body.id, "crm_1")
    const sent = JSON.parse(String(calls.fetch[0].init.body))
    assert.equal(sent.approvedBy, "sam@globex.com")
    const headers = calls.fetch[0].init.headers as Record<string, string>
    assert.equal(headers.Authorization, "Bearer crm_demo_token")
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(headers["X-FormStudio-Signature"])
    assert.ok(m)
    assert.equal(m![2], hmacSignature("whsec_demo_crm", Number(m![1]), String(calls.fetch[0].init.body)))
  })

  it("routes to the rejected branch", async () => {
    const { env: e, calls } = env()
    const g = leadRoutingGraph()
    const data = { lead_tier: "enterprise" }
    const first = await run(g, data, e)
    const steps: StepRecord[] = []
    const res = await advanceGraph(g, first.state, scopeFor(data), e, (s) => void steps.push(s), { nodeId: "approval_1", branch: "rejected", output: { decision: "rejected", reviewer: "x", comment: "no" } })
    assert.equal(res.outcome.status, "SUCCEEDED")
    assert.deepEqual(steps.map((s) => s.nodeId), ["approval_1", "update_2"])
    assert.equal(calls.fetch.length, 0)
  })
})

describe("delay & HTTP behaviour", () => {
  const delayGraph = (): AutomationGraph => ({
    nodes: [
      { id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "T", config: defaultNodeConfig("trigger") } },
      { id: "delay_1", type: "delay", position: { x: 0, y: 0 }, data: { label: "Wait", config: { amount: 2, unit: "hours" } } },
      { id: "notify_1", type: "notify", position: { x: 0, y: 0 }, data: { label: "N", config: defaultNodeConfig("notify") } },
    ],
    edges: [
      { id: "a", source: "trigger_1", target: "delay_1" },
      { id: "b", source: "delay_1", target: "notify_1" },
    ],
  })

  it("pauses delays with a resumeAt timestamp (and skips them in test runs)", async () => {
    const live = await run(delayGraph(), {}, env().env)
    assert.equal(live.outcome.status, "WAITING_DELAY")
    if (live.outcome.status === "WAITING_DELAY") assert.ok(Math.abs(live.outcome.resumeAt.getTime() - Date.now() - 2 * 3600_000) < 5000)
    const test = await run(delayGraph(), {}, env({ isTest: true }).env)
    assert.equal(test.outcome.status, "SUCCEEDED")
  })

  it("retries 5xx responses and fails after the last attempt", async () => {
    let attempts = 0
    const failing = env({
      fetch: (async () => {
        attempts++
        return new Response("down", { status: 503 })
      }) as typeof fetch,
    })
    const g: AutomationGraph = {
      nodes: [
        { id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "T", config: defaultNodeConfig("trigger") } },
        { id: "http_1", type: "http", position: { x: 0, y: 0 }, data: { label: "H", config: { ...defaultNodeConfig("http"), url: "https://api.example.com/x", retries: 2 } } },
      ],
      edges: [{ id: "a", source: "trigger_1", target: "http_1" }],
    }
    const r = await run(g, {}, failing.env)
    assert.equal(attempts, 3)
    assert.equal(r.outcome.status, "FAILED")
    assert.equal(r.steps.at(-1)?.status, "FAILED")
  })

  it("blocks SSRF to private hosts and non-http schemes", () => {
    for (const u of ["http://127.0.0.1/", "http://localhost:3000", "http://10.0.0.5", "http://192.168.1.1", "http://169.254.169.254/latest", "file:///etc/passwd"]) {
      assert.throws(() => assertSafeUrl(u, false), Error, u)
    }
    assert.equal(assertSafeUrl("https://api.example.com", false).hostname, "api.example.com")
  })
})
