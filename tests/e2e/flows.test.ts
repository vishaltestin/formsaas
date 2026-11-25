/**
 * End-to-end flows against a running production server (see scripts/e2e.mjs).
 * Exercises the hosted form pipeline, embeds, auth-gated dashboard pages, the
 * Developer API over HTTP and a full human-approval automation round trip.
 */
import "dotenv/config"

import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"

import { DEMO_API_KEY } from "../../prisma/seed-v2"
import { defaultNodeConfig } from "../../lib/automations/types"
import { normalizeSchema } from "../../lib/form-engine"
import { prisma } from "../../lib/prisma"

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100"
const created: { automationIds: string[] } = { automationIds: [] }

async function http(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers)
  if (init.cookie) headers.set("cookie", init.cookie)
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text)
  } catch {
    /* html */
  }
  return { res, status: res.status, text, json }
}

async function login(email: string, password: string) {
  const jar = new Map<string, string>()
  const absorb = (res: Response) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";")
      const i = pair.indexOf("=")
      jar.set(pair.slice(0, i), pair.slice(i + 1))
    }
  }
  const cookie = () => Array.from(jar, ([k, v]) => `${k}=${v}`).join("; ")
  const csrf = await fetch(`${BASE}/api/auth/csrf`)
  absorb(csrf)
  const { csrfToken } = (await csrf.json()) as { csrfToken: string }
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({ email, password, csrfToken, callbackUrl: `${BASE}/dashboard` }),
  })
  absorb(res)
  return cookie()
}

let contact: { id: string; slug: string; ids: Record<string, string> }
let leadId = ""

before(async () => {
  const f = await prisma.form.findUniqueOrThrow({ where: { slug: "contact-support" } })
  const schema = normalizeSchema(f.publishedSchema)
  contact = { id: f.id, slug: f.slug, ids: Object.fromEntries(schema.fields.map((x) => [x.key, x.id])) }
  leadId = (await prisma.form.findUniqueOrThrow({ where: { slug: "lead-qualification" } })).id
})

after(async () => {
  await prisma.automation.deleteMany({ where: { id: { in: created.automationIds } } })
  await prisma.$disconnect()
})

function validContact(extra: Record<string, unknown> = {}) {
  const v = (k: string, val: unknown) => [contact.ids[k], val]
  return Object.fromEntries([
    v("full_name", "E2E Tester"),
    v("email", "e2e@example.com"),
    v("topic", "billing"),
    v("priority", "normal"),
    v("message", "End-to-end test submission — please ignore."),
    v("consent", true),
    ...Object.entries(extra),
  ])
}

describe("marketing & hosted form", () => {
  it("renders the homepage sandbox", async () => {
    const r = await http("/")
    assert.equal(r.status, 200)
    assert.match(r.text, /The form platform for teams that can.t afford/)
    assert.match(r.text, /Vendor KYC onboarding/)
    assert.match(r.text, /Digital Fueled/)
    assert.match(r.text, /Book a product demo/)
  })

  it("serves hosted forms with anti-framing and embeds with frame-ancestors *", async () => {
    const page = await http(`/f/${contact.slug}`)
    assert.equal(page.status, 200)
    const xfo = page.res.headers.get("x-frame-options") ?? ""
    const csp = page.res.headers.get("content-security-policy") ?? ""
    assert.ok(/deny/i.test(xfo) || /frame-ancestors 'none'/.test(csp))
    const embed = await http(`/embed/${contact.slug}`)
    assert.equal(embed.status, 200)
    assert.match(embed.res.headers.get("content-security-policy") ?? "", /frame-ancestors \*/)
    assert.equal((await http("/api/embed.js")).status, 200)
  })
})

describe("public submission pipeline", () => {
  const submit = (body: Record<string, unknown>) =>
    http(`/api/public/forms/${contact.slug}/submit`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 2}` }, body: JSON.stringify({ sessionId: `e2e_${Date.now()}`, source: "DIRECT", startedAt: Date.now() - 60_000, ...body }) })

  it("rejects tampered payloads with unknown field ids", async () => {
    const r = await submit({ values: { ...validContact(), is_admin: true } })
    assert.equal(r.status, 400)
    assert.equal(r.json.code, "unknown_fields")
  })

  it("validates required fields server-side", async () => {
    const r = await submit({ values: { [contact.ids.full_name]: "X" } })
    assert.equal(r.status, 422)
    assert.ok((r.json.errors as Record<string, string>)[contact.ids.email])
  })

  it("blocks bots submitting faster than the minimum time", async () => {
    const r = await submit({ values: validContact(), startedAt: Date.now() })
    assert.equal(r.status, 429)
    assert.equal(r.json.code, "too_fast")
  })

  it("silently drops honeypot submissions", async () => {
    const before = await prisma.submission.count({ where: { formId: contact.id } })
    const r = await submit({ values: validContact(), hp: "http://spam.example" })
    assert.equal(r.status, 200)
    assert.equal(r.json.submissionId, null)
    assert.equal(await prisma.submission.count({ where: { formId: contact.id } }), before)
  })

  it("stores a valid submission keyed by field key and serves its receipt", async () => {
    const r = await submit({ values: validContact() })
    assert.equal(r.status, 200, r.text)
    const id = String(r.json.submissionId)
    const row = await prisma.submission.findUniqueOrThrow({ where: { id } })
    assert.equal((row.data as Record<string, unknown>).email, "e2e@example.com")
    if (r.json.receiptUrl) {
      const receipt = await http(String(r.json.receiptUrl).replace(/^https?:\/\/[^/]+/, ""))
      assert.equal(receipt.status, 200)
      assert.match(receipt.text, /E2E Tester/)
    }
    await prisma.submission.delete({ where: { id } })
  })
})

describe("workspace (authenticated)", () => {
  let cookie = ""
  before(async () => {
    cookie = await login("demo@formstudio.dev", "Demo@12345")
  })

  it("redirects anonymous visitors to /login", async () => {
    const r = await http("/dashboard")
    assert.ok([302, 303, 307, 308].includes(r.status))
    assert.match(r.res.headers.get("location") ?? "", /\/login/)
  })

  for (const [name, path, marker] of [
    ["dashboard", "/dashboard", /Lead Qualification/],
    ["developer portal", "/dashboard/developers", /Demo key \(README\)/],
    ["request logs tab", "/dashboard/developers?tab=logs", /api\/v1/],
    ["automation studio", () => `/dashboard/forms/${leadId}/automations`, /Lead routing with approval/],
    ["submissions", () => `/dashboard/forms/${leadId}/submissions`, /Submissions|Responses/],
    ["analytics", () => `/dashboard/forms/${leadId}/analytics`, /Conversion/],
    ["builder", () => `/dashboard/forms/${leadId}/edit`, /SaaS Lead Qualification/],
    ["team", "/dashboard/team", /lee@formstudio\.dev/],
    ["team activity", "/dashboard/team?tab=activity", /Support desk/],
    ["form access", () => `/dashboard/forms/${leadId}/access`, /People &amp; access|People & access/],
    ["email delivery settings", "/dashboard/settings/email", /Email delivery/],
    ["workspace settings", "/dashboard/settings", /Workspace name/],
  ] as const) {
    it(`renders the ${name}`, async () => {
      const r = await http(typeof path === "function" ? path() : path, { cookie })
      assert.equal(r.status, 200, `${name} → ${r.status}`)
      assert.match(r.text, marker)
    })
  }
})

describe("team roles (RBAC)", () => {
  let sam = ""
  let lee = ""
  before(async () => {
    ;[sam, lee] = await Promise.all([login("sam@formstudio.dev", "Sam@12345"), login("lee@formstudio.dev", "Lee@12345")])
  })

  it("shows a member only the forms assigned to their group", async () => {
    const r = await http("/dashboard", { cookie: sam })
    assert.equal(r.status, 200)
    assert.match(r.text, /Contact &amp; Support|Contact & Support/)
    assert.doesNotMatch(r.text, /SaaS Lead Qualification/)
  })

  it("lets a reviewer read responses but not open the builder or access settings", async () => {
    assert.equal((await http(`/dashboard/forms/${contact.id}/submissions`, { cookie: sam })).status, 200)
    const edit = await http(`/dashboard/forms/${contact.id}/edit`, { cookie: sam })
    assert.ok([302, 303, 307].includes(edit.status), `edit → ${edit.status}`)
    assert.match(edit.res.headers.get("location") ?? "", /submissions/)
    const access = await http(`/dashboard/forms/${contact.id}/access`, { cookie: sam })
    assert.ok([302, 303, 307].includes(access.status))
  })

  it("hides unassigned forms entirely", async () => {
    const r = await http(`/dashboard/forms/${leadId}/submissions`, { cookie: sam })
    assert.ok([302, 303, 307].includes(r.status))
    assert.match(r.res.headers.get("location") ?? "", /\/dashboard$/)
  })

  it("keeps workspace admin pages away from members and editors", async () => {
    for (const cookie of [sam, lee]) {
      const r = await http("/dashboard/settings/email", { cookie })
      assert.ok([302, 303, 307].includes(r.status), `email settings → ${r.status}`)
    }
    const team = await http("/dashboard/team", { cookie: sam })
    assert.equal(team.status, 200)
    assert.doesNotMatch(team.text, /Invite people/)
  })

  it("lets an editor open the builder of a form shared with Edit access", async () => {
    const r = await http(`/dashboard/forms/${leadId}/edit`, { cookie: lee })
    assert.equal(r.status, 200)
    assert.match(r.text, /SaaS Lead Qualification/)
  })

  it("rejects invitation links that don't exist", async () => {
    const r = await http("/invite/not-a-real-invitation-token-000000")
    assert.equal(r.status, 200)
    assert.match(r.text, /Invitation not found/)
  })
})

describe("custom HTML email templates", () => {
  let dana = ""
  let sam = ""
  let maya = ""
  let templateId = ""
  before(async () => {
    ;[dana, sam, maya] = await Promise.all([login("demo@formstudio.dev", "Demo@12345"), login("sam@formstudio.dev", "Sam@12345"), login("maya@northwind.dev", "Maya@12345")])
    templateId = (await prisma.emailTemplate.findFirstOrThrow({ where: { name: "Dana Demo Co. letter" } })).id
  })

  it("lists the workspace's templates with create controls for editors", async () => {
    const r = await http("/dashboard/settings/email-templates", { cookie: dana })
    assert.equal(r.status, 200)
    assert.match(r.text, /Dana Demo Co\. letter/)
    assert.match(r.text, /New template/)
    assert.match(r.text, /Contact &amp; Support Inquiry · thank-you/, "usage lists the seeded form")
  })

  it("opens the HTML editor", async () => {
    const r = await http(`/dashboard/settings/email-templates/${templateId}`, { cookie: dana })
    assert.equal(r.status, 200)
    assert.match(r.text, /Default subject/)
    assert.match(r.text, /Email preview|Loading editor/)
  })

  it("shows members the templates read-only", async () => {
    const r = await http("/dashboard/settings/email-templates", { cookie: sam })
    assert.equal(r.status, 200)
    assert.match(r.text, /Dana Demo Co\. letter/)
    assert.doesNotMatch(r.text, /New template/)
  })

  it("keeps templates inside their workspace and gates free plans", async () => {
    const foreign = await http(`/dashboard/settings/email-templates/${templateId}`, { cookie: maya })
    assert.equal(foreign.status, 404)
    const own = await http("/dashboard/settings/email-templates", { cookie: maya })
    assert.equal(own.status, 200)
    assert.match(own.text, /Pro feature/)
  })

  it("offers the template in the form builder", async () => {
    const r = await http(`/dashboard/forms/${contact.id}/edit`, { cookie: dana })
    assert.equal(r.status, 200)
    assert.match(r.text, /Dana Demo Co\. letter/)
  })

  it("returns 404 for unknown email images", async () => {
    const r = await http("/api/assets/doesnotexist0001/logo.png")
    assert.equal(r.status, 404)
  })
})

describe("developer API over HTTP", () => {
  const auth = { authorization: `Bearer ${DEMO_API_KEY}` }

  it("serves the OpenAPI document with CORS", async () => {
    const r = await http("/api/v1/openapi.json")
    assert.equal(r.status, 200)
    assert.equal(r.res.headers.get("access-control-allow-origin"), "*")
    assert.match(String(r.json.openapi), /^3\.1/)
  })

  it("lists forms and paginates submissions with the demo key", async () => {
    const forms = await http("/api/v1/forms", { headers: auth })
    assert.equal(forms.status, 200)
    assert.ok((forms.json.data as { id: string }[]).some((f) => f.id === leadId))
    const page = await http(`/api/v1/forms/${leadId}/submissions?limit=5`, { headers: auth })
    assert.equal(page.status, 200)
    assert.equal((page.json.data as unknown[]).length, 5)
    const next = await http(`/api/v1/forms/${leadId}/submissions?limit=5&cursor=${page.json.nextCursor}`, { headers: auth })
    assert.equal(next.status, 200)
    assert.notEqual((next.json.data as { id: string }[])[0].id, (page.json.data as { id: string }[])[0].id)
  })

  it("returns uniform JSON errors", async () => {
    const r = await http("/api/v1/forms", { headers: { authorization: "Bearer fs_live_bogus" } })
    assert.equal(r.status, 401)
    assert.equal((r.json.error as { code: string }).code, "invalid_api_key")
  })
})

describe("human approval round trip", () => {
  it("pauses on the gate, notifies, and resumes from the signed reviewer link", async () => {
    const automation = await prisma.automation.create({
      data: {
        formId: contact.id,
        name: "E2E approval",
        enabled: true,
        trigger: "MANUAL",
        graph: {
          nodes: [
            { id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Manual", config: { ...defaultNodeConfig("trigger"), kind: "MANUAL" } } },
            { id: "approval_1", type: "approval", position: { x: 0, y: 100 }, data: { label: "Gate", config: { reviewers: "", message: "Approve {{trigger.data.ticket}}?", notifyOwner: true } } },
            { id: "notify_1", type: "notify", position: { x: 0, y: 200 }, data: { label: "Done", config: { title: "E2E approved by {{nodes.approval_1.reviewer}}", body: "", href: "" } } },
          ],
          edges: [
            { id: "e1", source: "trigger_1", target: "approval_1" },
            { id: "e2", source: "approval_1", target: "notify_1", sourceHandle: "approved" },
          ],
        },
      },
    })
    created.automationIds.push(automation.id)
    const trig = await http(`/api/v1/automations/${automation.id}/trigger`, {
      method: "POST",
      headers: { authorization: `Bearer ${DEMO_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ data: { ticket: "T-1" } }),
    })
    assert.equal(trig.status, 202, trig.text)
    const run = trig.json.data as { id: string; status: string }
    assert.equal(run.status, "WAITING_APPROVAL")

    const { signValue } = await import("../../lib/signing")
    const sig = signValue("approval", `${run.id}:approval_1`)
    assert.equal((await http(`/approvals/${run.id}?node=approval_1&sig=wrong-signature-xx`)).status, 404)
    const page = await http(`/approvals/${run.id}?node=approval_1&sig=${sig}`)
    assert.equal(page.status, 200)
    assert.match(page.text, /Approve T-1\?/)

    const decide = await http(`/api/automations/approvals/${run.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ node: "approval_1", sig, decision: "approved", reviewer: "e2e@reviewer.dev", comment: "ok" }),
    })
    assert.equal(decide.status, 200, decide.text)
    const final = await prisma.automationRun.findUniqueOrThrow({ where: { id: run.id }, include: { steps: true } })
    assert.equal(final.status, "SUCCEEDED")
    assert.deepEqual(final.steps.map((s) => `${s.nodeId}:${s.status}`).sort(), ["approval_1:SUCCEEDED", "notify_1:SUCCEEDED", "trigger_1:SUCCEEDED"])
    const again = await http(`/api/automations/approvals/${run.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ node: "approval_1", sig, decision: "rejected" }) })
    assert.ok(again.status >= 400, "a decided gate cannot be decided twice")
  })
})
