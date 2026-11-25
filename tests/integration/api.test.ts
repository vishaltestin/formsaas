/**
 * Developer API integration tests. Route handlers are invoked in-process
 * against the real database (run with `--conditions=react-server`).
 */
import "dotenv/config"

import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"

import { NextRequest } from "next/server"

import * as formRoute from "../../app/api/v1/forms/[formId]/route"
import * as publishRoute from "../../app/api/v1/forms/[formId]/publish/route"
import * as submissionsRoute from "../../app/api/v1/forms/[formId]/submissions/route"
import * as formsRoute from "../../app/api/v1/forms/route"
import * as meRoute from "../../app/api/v1/me/route"
import * as submissionRoute from "../../app/api/v1/submissions/[submissionId]/route"
import * as triggerRoute from "../../app/api/v1/automations/[automationId]/trigger/route"
import * as specRoute from "../../app/api/v1/openapi.json/route"
import * as slotsRoute from "../../app/api/public/forms/[slug]/slots/route"
import { appointmentDates } from "../../lib/form-engine"
import { generateApiKey, type ApiScope } from "../../lib/api/keys"
import { defaultNodeConfig } from "../../lib/automations/types"
import { prisma } from "../../lib/prisma"

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

const EMAIL = "api-tests@formstudio.test"
const OTHER = "api-tests-other@formstudio.test"
let userId = ""
let workspaceId = ""
let otherFormId = ""

async function makeKey(scopes: ApiScope[], extra: { rateLimit?: number; expiresAt?: Date; revokedAt?: Date; owner?: string; workspace?: string } = {}) {
  const k = generateApiKey()
  await prisma.apiKey.create({
    data: { userId: extra.owner ?? userId, workspaceId: extra.workspace ?? workspaceId, name: `test ${scopes.join(",")}`, prefix: k.prefix, hash: k.hash, scopes, rateLimit: extra.rateLimit ?? 1000, expiresAt: extra.expiresAt, revokedAt: extra.revokedAt },
  })
  return k.raw
}

async function call(handler: unknown, method: string, path: string, opts: { key?: string | null; body?: unknown; headers?: Record<string, string>; params?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...(opts.headers ?? {}) }
  if (opts.key) headers.authorization = `Bearer ${opts.key}`
  const req = new NextRequest(`http://localhost:3000${path}`, { method, headers, body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body) })
  const res = await (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { status: res.status, headers: res.headers, json, text }
}

const errCode = (r: { json: Record<string, unknown> }) => (r.json.error as { code?: string } | undefined)?.code

const FIELDS = [
  { id: "f_name", key: "name", type: "short_text", label: "Name", required: true, validation: { minLength: 2 } },
  { id: "f_email", key: "email", type: "email", label: "Email", required: true },
  { id: "f_qty", key: "qty", type: "number", label: "Quantity", validation: { min: 1, max: 10 } },
  { id: "f_total", key: "total", type: "calculated", label: "Total", props: { formula: "{{qty}} * 10" } },
  { id: "f_vip", key: "vip_code", type: "short_text", label: "VIP code", required: true },
]
const LOGIC = [
  {
    id: "r_vip",
    name: "VIP code only for big orders",
    enabled: true,
    combinator: "AND",
    conditions: [{ id: "c1", fieldId: "f_qty", operator: "greater_than", value: "5" }],
    actions: [{ id: "a1", type: "SHOW_FIELD", targetFieldId: "f_vip" }],
  },
]

before(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, OTHER] } } })
  const pro = await prisma.plan.findUniqueOrThrow({ where: { slug: "pro" } })
  const user = await prisma.user.create({ data: { email: EMAIL, name: "API Tests" } })
  userId = user.id
  await prisma.subscription.create({ data: { userId, planId: pro.id, status: "ACTIVE" } })
  workspaceId = (await prisma.workspace.create({ data: { name: "API tests", ownerId: userId, members: { create: { userId, role: "OWNER" } } } })).id
  const other = await prisma.user.create({ data: { email: OTHER, name: "Other" } })
  const otherWs = await prisma.workspace.create({ data: { name: "Other", ownerId: other.id, members: { create: { userId: other.id, role: "OWNER" } } } })
  const f = await prisma.form.create({ data: { userId: other.id, workspaceId: otherWs.id, title: "Private", slug: `private-${Date.now()}`, draftSchema: { version: 1, fields: [], logic: [] }, themeConfig: {}, settings: {} } })
  otherFormId = f.id
})

after(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, OTHER] } } })
  await prisma.$disconnect()
})

describe("authentication", () => {
  it("rejects missing, malformed, unknown, revoked and expired keys", async () => {
    assert.equal(errCode(await call(meRoute.GET, "GET", "/api/v1/me")), "unauthorized")
    assert.equal(errCode(await call(meRoute.GET, "GET", "/api/v1/me", { key: "nope" })), "invalid_api_key")
    assert.equal(errCode(await call(meRoute.GET, "GET", "/api/v1/me", { key: generateApiKey().raw })), "invalid_api_key")
    const revoked = await makeKey(["forms:read"], { revokedAt: new Date() })
    assert.equal(errCode(await call(meRoute.GET, "GET", "/api/v1/me", { key: revoked })), "api_key_revoked")
    const expired = await makeKey(["forms:read"], { expiresAt: new Date(Date.now() - 1000) })
    assert.equal(errCode(await call(meRoute.GET, "GET", "/api/v1/me", { key: expired })), "api_key_expired")
  })

  it("accepts a valid key, stores only the hash and logs the request", async () => {
    const key = await makeKey(["forms:read"])
    const r = await call(meRoute.GET, "GET", "/api/v1/me", { key })
    assert.equal(r.status, 200)
    assert.ok(r.headers.get("x-request-id"))
    assert.ok(r.headers.get("x-ratelimit-limit"))
    assert.equal(await prisma.apiKey.count({ where: { hash: key } }), 0)
    await new Promise((res) => setTimeout(res, 50))
    assert.ok((await prisma.apiRequestLog.count({ where: { userId, path: "/api/v1/me", status: 200 } })) >= 1)
  })
})

describe("scopes & tenancy", () => {
  it("enforces scopes per endpoint", async () => {
    const readOnly = await makeKey(["forms:read"])
    const r = await call(formsRoute.POST, "POST", "/api/v1/forms", { key: readOnly, body: { title: "Nope" } })
    assert.equal(r.status, 403)
    assert.equal(errCode(r), "insufficient_scope")
    assert.equal((await call(formsRoute.GET, "GET", "/api/v1/forms", { key: readOnly })).status, 200)
  })

  it("never exposes another user's forms", async () => {
    const key = await makeKey(["forms:read"])
    const r = await call(formRoute.GET, "GET", `/api/v1/forms/${otherFormId}`, { key, params: { formId: otherFormId } })
    assert.equal(r.status, 404)
  })
})

describe("forms, draft/publish isolation and submissions", () => {
  let key = ""
  let formId = ""

  before(async () => {
    key = await makeKey(["forms:read", "forms:write", "submissions:read", "submissions:write"])
  })

  it("creates, publishes and reads a form", async () => {
    const created = await call(formsRoute.POST, "POST", "/api/v1/forms", { key, body: { title: "API order form", mode: "CLASSIC", schema: { fields: FIELDS, logic: LOGIC } } })
    assert.equal(created.status, 201, created.text)
    formId = (created.json.data as { id: string }).id
    const before = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { name: "Ada", email: "ada@example.com" } } })
    assert.equal(before.status, 409)
    assert.equal(errCode(before), "not_published")
    const pub = await call(publishRoute.POST, "POST", `/api/v1/forms/${formId}/publish`, { key, params: { formId } })
    assert.equal(pub.status, 200, pub.text)
    const got = await call(formRoute.GET, "GET", `/api/v1/forms/${formId}`, { key, params: { formId } })
    assert.equal((got.json.data as { status: string }).status, "PUBLISHED")
  })

  it("validates with the shared Zod schema and returns field-keyed details", async () => {
    const r = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { name: "A", email: "not-an-email", qty: 50 } } })
    assert.equal(r.status, 422)
    const details = (r.json.error as { details: Record<string, string> }).details
    assert.ok(details.name && details.email && details.qty)
  })

  it("rejects unknown keys and strict-body violations", async () => {
    const r = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { name: "Ada", email: "a@b.co", is_admin: true } } })
    assert.equal(r.status, 400)
    assert.equal(errCode(r), "unknown_fields")
    const strict = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: {}, extra: 1 } })
    assert.equal(errCode(strict), "invalid_request")
    const bad = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: "{nope" })
    assert.equal(errCode(bad), "invalid_json")
  })

  it("applies conditional logic: hidden fields are optional, revealed ones required", async () => {
    const small = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { name: "Ada", email: "ada@example.com", qty: 2 } } })
    assert.equal(small.status, 201, small.text)
    const big = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { name: "Ada", email: "ada@example.com", qty: 8 } } })
    assert.equal(big.status, 422)
    assert.ok((big.json.error as { details: Record<string, string> }).details.vip_code)
  })

  it("recomputes calculated fields server-side, ignoring tampered values", async () => {
    const r = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { name: "Ada", email: "ada@example.com", qty: 3, total: 1 } } })
    assert.equal(r.status, 201, r.text)
    assert.equal((r.json.data as { data: Record<string, unknown> }).data.total, 30)
  })

  it("keeps draft edits out of live validation until publish", async () => {
    const withPhone = [...FIELDS, { id: "f_phone", key: "phone", type: "phone", label: "Phone" }]
    const patched = await call(formRoute.PATCH, "PATCH", `/api/v1/forms/${formId}`, { key, params: { formId }, body: { schema: { fields: withPhone, logic: LOGIC } } })
    assert.equal(patched.status, 200, patched.text)
    assert.equal((patched.json.data as { hasUnpublishedChanges: boolean }).hasUnpublishedChanges, true)
    const draftOnly = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { name: "Ada", email: "ada@example.com", phone: "+1 555" } } })
    assert.equal(errCode(draftOnly), "unknown_fields")
    await call(publishRoute.POST, "POST", `/api/v1/forms/${formId}/publish`, { key, params: { formId } })
    const live = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { name: "Ada", email: "ada@example.com", phone: "+1 555 0100" } } })
    assert.equal(live.status, 201, live.text)
  })

  it("deduplicates retries with Idempotency-Key", async () => {
    const body = { data: { name: "Idem", email: "idem@example.com" } }
    const headers = { "idempotency-key": `order-${Date.now()}` }
    const a = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body, headers })
    const b = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body, headers })
    assert.equal(a.status, 201)
    assert.equal(b.status, 201)
    assert.equal(b.headers.get("idempotent-replayed"), "true")
    assert.equal((a.json.data as { id: string }).id, (b.json.data as { id: string }).id)
    assert.equal(await prisma.submission.count({ where: { formId, data: { path: "$.name", equals: "Idem" } } }).catch(async () => (await prisma.submission.findMany({ where: { formId } })).filter((s) => (s.data as { name?: string }).name === "Idem").length), 1)
    const reused = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { name: "Other", email: "o@example.com" } }, headers })
    assert.equal(reused.status, 422)
    assert.equal(errCode(reused), "idempotency_key_reused")
  })

  it("enforces submission caps", async () => {
    const form = await prisma.form.findUniqueOrThrow({ where: { id: formId } })
    const count = await prisma.submission.count({ where: { formId } })
    await prisma.form.update({ where: { id: formId }, data: { settings: { ...((form.settings as object) ?? {}), maxSubmissions: count } } })
    const r = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { name: "Late", email: "late@example.com" } } })
    assert.equal(r.status, 403)
    assert.match(String(errCode(r)), /form_(cap|closed|full)/)
  })

  it("lists, updates and exports submissions", async () => {
    const list = await call(submissionsRoute.GET, "GET", `/api/v1/forms/${formId}/submissions?limit=2`, { key, params: { formId } })
    assert.equal(list.status, 200)
    assert.equal((list.json.data as unknown[]).length, 2)
    assert.equal(list.json.hasMore, true)
    const id = (list.json.data as { id: string }[])[0].id
    const patched = await call(submissionRoute.PATCH, "PATCH", `/api/v1/submissions/${id}`, { key, params: { submissionId: id }, body: { status: "REVIEWED", tags: ["vip"] } })
    assert.equal(patched.status, 200, patched.text)
    assert.equal((patched.json.data as { status: string }).status, "REVIEWED")
    const csv = await call(submissionsRoute.GET, "GET", `/api/v1/forms/${formId}/submissions?format=csv`, { key, params: { formId } })
    assert.match(csv.text.split("\r\n")[0], /^id,createdAt,status,score,name,email/)
  })
})

describe("appointment slots", () => {
  it("prevents double-booking an exclusive slot and reports taken times", async () => {
    const key = await makeKey(["forms:read", "forms:write", "submissions:write"])
    const props = { slotStart: "09:00", slotEnd: "12:00", slotMinutes: 30, daysAhead: 30, weekdays: [0, 1, 2, 3, 4, 5, 6], exclusiveSlots: true }
    const created = await call(formsRoute.POST, "POST", "/api/v1/forms", {
      key,
      body: { title: "Clinic booking", mode: "CLASSIC", schema: { fields: [{ id: "f_who", key: "who", type: "short_text", label: "Name", required: true }, { id: "f_slot", key: "slot", type: "appointment", label: "Slot", required: true, props }], logic: [] } },
    })
    assert.equal(created.status, 201, created.text)
    const formId = (created.json.data as { id: string }).id
    assert.equal((await call(publishRoute.POST, "POST", `/api/v1/forms/${formId}/publish`, { key, params: { formId } })).status, 200)
    const slug = (await prisma.form.findUniqueOrThrow({ where: { id: formId } })).slug
    const date = appointmentDates(props, new Date().toISOString().slice(0, 10))[2]

    const first = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { who: "Ada", slot: { date, time: "09:30" } } } })
    assert.equal(first.status, 201, first.text)
    const second = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { who: "Grace", slot: { date, time: "09:30" } } } })
    assert.equal(second.status, 409, second.text)
    assert.equal(errCode(second), "slot_taken")
    const other = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { who: "Grace", slot: { date, time: "10:00" } } } })
    assert.equal(other.status, 201, other.text)
    const outside = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { who: "Lin", slot: { date, time: "13:00" } } } })
    assert.equal(outside.status, 422, outside.text)

    const slots = await call(slotsRoute.GET, "GET", `/api/public/forms/${slug}/slots?field=f_slot&date=${date}`, { params: { slug } })
    assert.equal(slots.status, 200, slots.text)
    assert.deepEqual([...(slots.json.taken as string[])].sort(), ["09:30", "10:00"])
    const bad = await call(slotsRoute.GET, "GET", `/api/public/forms/${slug}/slots?field=f_slot&date=nope`, { params: { slug } })
    assert.equal(bad.status, 400)
    assert.ok(!slots.text.includes("Ada"), "no respondent data leaks")
  })
})

describe("thank-you email", () => {
  it("sends a merge-tagged auto-reply to the respondent and records it in the outbox", async () => {
    const key = await makeKey(["forms:read", "forms:write", "submissions:write"])
    const created = await call(formsRoute.POST, "POST", "/api/v1/forms", {
      key,
      body: { title: "Auto-reply check", mode: "CLASSIC", schema: { fields: [FIELDS[0], FIELDS[1]], logic: [] } },
    })
    assert.equal(created.status, 201, created.text)
    const formId = (created.json.data as { id: string }).id
    const form = await prisma.form.findUniqueOrThrow({ where: { id: formId } })
    await prisma.form.update({
      where: { id: formId },
      data: {
        settings: {
          ...(form.settings as object),
          respondentEmailFieldId: "f_email",
          autoReply: { enabled: true, subject: "Thanks {{name}} for {{form_title}}", heading: "Hello {{name}}", body: "Ref {{submission_id}}", includeAnswers: true, fromName: "", replyTo: "owner@formstudio.test" },
        },
      },
    })
    assert.equal((await call(publishRoute.POST, "POST", `/api/v1/forms/${formId}/publish`, { key, params: { formId } })).status, 200)
    const res = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${formId}/submissions`, { key, params: { formId }, body: { data: { name: "Ada", email: "ada@formstudio.test" } } })
    assert.equal(res.status, 201, res.text)
    const subId = (res.json.data as { id: string }).id
    let row = null
    for (let i = 0; i < 30 && !row; i++) {
      row = await prisma.emailOutbox.findFirst({ where: { source: `receipt:${subId}` } })
      if (!row) await new Promise((r) => setTimeout(r, 100))
    }
    assert.ok(row, "auto-reply recorded in the outbox")
    assert.deepEqual(row.to, ["ada@formstudio.test"])
    assert.equal(row.subject, "Thanks Ada for Auto-reply check")
    assert.equal(row.replyTo, "owner@formstudio.test")
    assert.ok(row.html.includes("Hello Ada") && row.html.includes(subId), "heading and body are merge-tagged")
    assert.equal(row.status, "LOGGED", "no provider configured in tests")
    await prisma.emailOutbox.deleteMany({ where: { source: { in: [`receipt:${subId}`, `notify:${subId}`] } } })
  })
})

describe("rate limiting", () => {
  it("returns 429 with Retry-After once the per-key budget is spent", async () => {
    const key = await makeKey(["forms:read"], { rateLimit: 3 })
    const statuses: number[] = []
    let last: Awaited<ReturnType<typeof call>> | null = null
    for (let i = 0; i < 4; i++) {
      last = await call(meRoute.GET, "GET", "/api/v1/me", { key })
      statuses.push(last.status)
    }
    assert.deepEqual(statuses, [200, 200, 200, 429])
    assert.equal(errCode(last!), "rate_limited")
    assert.ok(Number(last!.headers.get("retry-after")) > 0)
    assert.equal(last!.headers.get("x-ratelimit-remaining"), "0")
  })
})

describe("manual automation trigger", () => {
  it("runs an enabled MANUAL automation and returns per-node steps", async () => {
    const form = await prisma.form.create({ data: { userId, workspaceId, title: "Trigger target", slug: `trigger-${Date.now()}`, draftSchema: { version: 1, fields: [], logic: [] }, themeConfig: {}, settings: {} } })
    const automation = await prisma.automation.create({
      data: {
        formId: form.id,
        name: "Manual",
        enabled: true,
        trigger: "MANUAL",
        graph: {
          nodes: [
            { id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Manual", config: { ...defaultNodeConfig("trigger"), kind: "MANUAL" } } },
            { id: "notify_1", type: "notify", position: { x: 0, y: 100 }, data: { label: "Notify", config: { title: "Hello {{trigger.data.who}}", body: "", href: "" } } },
          ],
          edges: [{ id: "e1", source: "trigger_1", target: "notify_1" }],
        },
      },
    })
    const noScope = await makeKey(["forms:read"])
    assert.equal((await call(triggerRoute.POST, "POST", `/api/v1/automations/${automation.id}/trigger`, { key: noScope, params: { automationId: automation.id }, body: {} })).status, 403)
    const key = await makeKey(["automations:trigger"])
    const r = await call(triggerRoute.POST, "POST", `/api/v1/automations/${automation.id}/trigger`, { key, params: { automationId: automation.id }, body: { data: { who: "API" } } })
    assert.equal(r.status, 202, r.text)
    const data = r.json.data as { status: string; steps: { nodeId: string; status: string }[] }
    assert.equal(data.status, "SUCCEEDED")
    assert.deepEqual(data.steps.map((s) => s.nodeId), ["trigger_1", "notify_1"])
    assert.equal(await prisma.notification.count({ where: { userId, title: "Hello API" } }), 1)
  })
})

describe("OpenAPI", () => {
  it("serves a valid 3.1 document covering every route", async () => {
    const r = await call(specRoute.GET, "GET", "/api/v1/openapi.json")
    assert.equal(r.status, 200)
    assert.match(String(r.json.openapi), /^3\.1/)
    const paths = Object.keys(r.json.paths as object)
    for (const p of ["/forms", "/forms/{formId}", "/forms/{formId}/publish", "/forms/{formId}/submissions", "/submissions/{submissionId}", "/automations/{automationId}/trigger"]) {
      assert.ok(paths.some((x) => x.endsWith(p)), p)
    }
  })
})
