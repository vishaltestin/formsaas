/**
 * Custom HTML email templates: rendering safety, the send path (thank-you +
 * notification), workspace isolation, the plan gate and image hosting.
 * Run with: tsx --conditions=react-server --test tests/integration/email-templates.test.ts
 */
import "dotenv/config"

import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"

import { NextRequest } from "next/server"

import * as assetRoute from "../../app/api/assets/[assetId]/[name]/route"
import * as publishRoute from "../../app/api/v1/forms/[formId]/publish/route"
import * as submissionsRoute from "../../app/api/v1/forms/[formId]/submissions/route"
import { generateApiKey } from "../../lib/api/keys"
import { executeNode, type ExecEnv } from "../../lib/automations/executors"
import { buildTemplateVars, renderCustomEmail, sampleVars, TemplateError, validateTemplateSource } from "../../lib/email/custom-template"
import { loadTemplateForSend, templateUsage } from "../../lib/email/template-store"
import { normalizeSchema } from "../../lib/form-engine"
import { prisma } from "../../lib/prisma"

const P = "tpl-tests"
const emails = { pro: `${P}-pro@formstudio.test`, free: `${P}-free@formstudio.test`, other: `${P}-other@formstudio.test` }
const ids: Record<string, string> = {}

const TEMPLATE = `<!doctype html><html><head><style>
  .card { background: #fdf6e3; padding: 24px; }
  h1 { color: #b58900; font-family: Georgia, serif; }
  @media (max-width: 600px) { .card { padding: 12px; } }
</style></head><body>
  <div class="card">
    <img src="https://cdn.example.com/logo.png" alt="Logo" width="120">
    <h1>Hi {{name}}</h1>
    <p>Thanks for {{form_title}} (ref {{submission_id}}).</p>
    {{answers_table}}
    {{#if dashboard_url}}<a href="{{dashboard_url}}">Open</a>{{/if}}
  </div>
</body></html>`

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(emails) } }, select: { id: true } })
  const userIds = users.map((u) => u.id)
  await prisma.workspace.deleteMany({ where: { ownerId: { in: userIds } } })
  await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
async function call(handler: unknown, method: string, path: string, opts: { key?: string; body?: unknown; params?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (opts.key) headers.authorization = `Bearer ${opts.key}`
  const req = new NextRequest(`http://localhost:3000${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) })
  const res = await (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) })
  return res
}

const FIELDS = [
  { id: "f_name", key: "name", type: "short_text", label: "Name", required: true },
  { id: "f_email", key: "email", type: "email", label: "Email", required: true },
  { id: "f_note", key: "note", type: "long_text", label: "Note" },
]

before(async () => {
  await cleanup()
  const [pro, free] = await Promise.all([prisma.plan.findUniqueOrThrow({ where: { slug: "pro" } }), prisma.plan.findUniqueOrThrow({ where: { slug: "free" } })])
  for (const [k, email] of Object.entries(emails)) ids[k] = (await prisma.user.create({ data: { email, name: k } })).id
  await prisma.subscription.create({ data: { userId: ids.pro, planId: pro.id, status: "ACTIVE" } })
  await prisma.subscription.create({ data: { userId: ids.free, planId: free.id, status: "ACTIVE" } })
  await prisma.subscription.create({ data: { userId: ids.other, planId: pro.id, status: "ACTIVE" } })
  const mk = async (owner: string, name: string) => (await prisma.workspace.create({ data: { name, ownerId: ids[owner], members: { create: { userId: ids[owner], role: "OWNER" } } } })).id
  ids.proWs = await mk("pro", `${P} studio`)
  ids.freeWs = await mk("free", `${P} free`)
  ids.otherWs = await mk("other", `${P} other`)
  ids.tpl = (await prisma.emailTemplate.create({ data: { workspaceId: ids.proWs, name: "Brand", subject: "Thanks {{name}} · {{form_title}}", html: TEMPLATE } })).id
  ids.freeTpl = (await prisma.emailTemplate.create({ data: { workspaceId: ids.freeWs, name: "Brand", subject: "x", html: TEMPLATE } })).id
  ids.foreignTpl = (await prisma.emailTemplate.create({ data: { workspaceId: ids.otherWs, name: "Theirs", subject: "Foreign {{name}}", html: "<p>FOREIGN TEMPLATE</p>" } })).id
})

after(async () => {
  await cleanup()
  await prisma.$disconnect()
})

describe("template rendering", () => {
  const schema = normalizeSchema({ version: 1, fields: FIELDS, logic: [] })
  const vars = (values: Record<string, string>, extras: Record<string, string | null> = {}) => buildTemplateVars({ schema, values, extras: { form_title: "Contact & Co", submission_id: "sub_1", ...extras } })

  it("escapes answers, inlines CSS and keeps media queries", () => {
    const out = renderCustomEmail({ html: TEMPLATE, subject: "Thanks {{name}}" }, vars({ f_name: `<img src=x onerror="alert(1)">Ada`, f_note: "line 1\nline 2" }))
    assert.ok(out.html.startsWith("<!doctype html>"))
    assert.ok(!/<[^>]*\sonerror=|<img src="x"/i.test(out.html), "answer HTML is escaped, not rendered")
    assert.ok(out.html.includes("&lt;img src=x"), "shown as text")
    assert.match(out.html, /<h1 style="[^"]*color: #b58900/, "h1 rule inlined")
    assert.match(out.html, /<div class="card" style="[^"]*padding: 24px/, "class rule inlined")
    assert.ok(out.html.includes("@media (max-width: 600px)"), "responsive rules preserved")
    assert.match(out.html, /line 1<br ?\/?>line 2/, "answers table keeps line breaks")
    assert.ok(out.html.includes('src="https://cdn.example.com/logo.png"'), "hosted images kept")
    assert.equal(out.subject, `Thanks <img src=x onerror="alert(1)">Ada`, "subject is plain text (not HTML-escaped)")
    assert.ok(out.text.includes("HI <IMG SRC=X") || out.text.includes("Hi <img src=x"), "plain-text version shows the answer as text")
    assert.ok(out.text.includes("Contact & Co"))
  })

  it("sanitises dangerous markup in the template and in triple-stash tags", () => {
    const html = `<p>{{{name}}}</p><script>alert(1)</script><a href="javascript:alert(2)">x</a><a href="https://ok.example">ok</a>
      <img src="data:image/png;base64,AAAA"><iframe src="https://evil"></iframe><form action="/steal"><input name="pw"></form>
      <div onclick="alert(3)" style="color:red">hi</div><link rel="stylesheet" href="https://evil/x.css">`
    const out = renderCustomEmail({ html, subject: "" }, vars({ f_name: `<script>alert(4)</script><b onmouseover="x()">bold</b>` }))
    assert.ok(!/<script|javascript:|onclick|onmouseover|<iframe|<form|<input|data:image|<link/i.test(out.html), out.html)
    assert.ok(out.html.includes('href="https://ok.example"'))
    assert.ok(out.html.includes("<b>bold</b>"), "harmless formatting survives")
    assert.ok(out.html.includes('style="color:red"') || out.html.includes('style="color: red"'))
  })

  it("only allows plain tags and the four built-in blocks", () => {
    for (const bad of ["{{> partial}}", "{{lookup this 'constructor'}}", "{{#custom}}x{{/custom}}", "{{#if a}}open", "{{#*inline \"x\"}}y{{/inline}}"]) {
      assert.throws(() => validateTemplateSource(bad), TemplateError, bad)
    }
    validateTemplateSource("{{#if name}}Hi {{name}}{{else}}Hi{{/if}} {{#each answers}}{{label}}={{value}}{{/each}} {{#unless x}}-{{/unless}} {{#with answers}}{{/with}}")
    const proto = renderCustomEmail({ html: "<p>[{{constructor}}][{{__proto__}}][{{answers.constructor.name}}]</p>", subject: "" }, vars({}))
    assert.ok(proto.html.includes("<p>[][][]</p>"), proto.html)
  })

  it("reports the line of a syntax error", () => {
    try {
      validateTemplateSource("<p>\n<p>\n{{#if name}}\n<p>never closed</p>")
      assert.fail("should throw")
    } catch (e) {
      assert.ok(e instanceof TemplateError)
      assert.match(e.message, /isn't closed/)
    }
    try {
      validateTemplateSource("<p>\n{{#if a}}\n{{/each}}")
      assert.fail("should throw")
    } catch (e) {
      assert.ok(e instanceof TemplateError)
      assert.equal(e.line, 2)
    }
  })

  it("renders sample data for previews", () => {
    const out = renderCustomEmail({ html: TEMPLATE, subject: "Hi {{name}}" }, sampleVars({ schema, formTitle: "Sample", workspaceName: "WS", dashboardUrl: "https://app.example/d" }))
    assert.ok(out.html.includes("Thanks for Sample"))
    assert.ok(out.html.includes('href="https://app.example/d"'))
  })
})

describe("template lookup", () => {
  it("only loads templates from the form's own workspace", async () => {
    assert.equal((await loadTemplateForSend(ids.proWs, ids.tpl))?.id, ids.tpl)
    assert.equal(await loadTemplateForSend(ids.proWs, ids.foreignTpl), null)
    assert.equal(await loadTemplateForSend(ids.proWs, null), null)
    assert.equal(await loadTemplateForSend(null, ids.tpl), null)
  })

  it("falls back to the built-in design when the plan doesn't include custom emails", async () => {
    assert.equal(await loadTemplateForSend(ids.freeWs, ids.freeTpl), null)
  })
})

describe("sending with a custom template", () => {
  it("uses the template for thank-you and notification emails, escaping answers", async () => {
    const k = generateApiKey()
    await prisma.apiKey.create({ data: { userId: ids.pro, workspaceId: ids.proWs, name: "tpl", prefix: k.prefix, hash: k.hash, scopes: ["forms:read", "forms:write", "submissions:write"], rateLimit: 1000 } })
    const form = await prisma.form.create({
      data: {
        userId: ids.pro,
        workspaceId: ids.proWs,
        title: "Studio enquiry",
        slug: `${P}-enquiry-${Date.now()}`,
        draftSchema: { version: 1, fields: FIELDS, logic: [] },
        themeConfig: {},
        settings: {
          respondentEmailFieldId: "f_email",
          notifyEmails: [`${P}-team@formstudio.test`],
          notifyTemplateId: ids.tpl,
          autoReply: { enabled: true, subject: "", heading: "unused", body: "unused", includeAnswers: true, fromName: "Studio", replyTo: "", templateId: ids.tpl },
        },
      },
    })
    assert.equal((await call(publishRoute.POST, "POST", `/api/v1/forms/${form.id}/publish`, { key: k.raw, params: { formId: form.id } })).status, 200)
    const res = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${form.id}/submissions`, {
      key: k.raw,
      params: { formId: form.id },
      body: { data: { name: "Ada <b>Lovelace</b>", email: `${P}-respondent@formstudio.test`, note: "Hello" } },
    })
    assert.equal(res.status, 201, await res.clone().text())
    const subId = ((await res.json()) as { data: { id: string } }).data.id

    let receipt = null
    let notify = null
    for (let i = 0; i < 40 && (!receipt || !notify); i++) {
      receipt = await prisma.emailOutbox.findFirst({ where: { source: `receipt:${subId}` } })
      notify = await prisma.emailOutbox.findFirst({ where: { source: `notify:${subId}` } })
      if (!receipt || !notify) await new Promise((r) => setTimeout(r, 100))
    }
    assert.ok(receipt && notify, "both emails recorded")
    assert.equal(receipt.subject, "Thanks Ada <b>Lovelace</b> · Studio enquiry", "template subject used when the form's is blank")
    assert.ok(receipt.html.includes("Hi Ada &lt;b&gt;Lovelace&lt;/b&gt;"), "answers escaped in HTML")
    assert.ok(receipt.html.includes(subId))
    assert.match(receipt.html, /<h1 style="[^"]*#b58900/, "CSS inlined")
    assert.ok(!receipt.html.includes("unused"), "built-in heading/body not used")
    assert.ok(receipt.html.includes("Hello"), "answers table included")
    assert.ok(notify.html.includes(`/dashboard/forms/${form.id}/submissions?id=${subId}`), "notification gets the dashboard link")
    await prisma.emailOutbox.deleteMany({ where: { source: { in: [`receipt:${subId}`, `notify:${subId}`] } } })
  })

  it("ignores a template id from another workspace", async () => {
    const k = generateApiKey()
    await prisma.apiKey.create({ data: { userId: ids.pro, workspaceId: ids.proWs, name: "tpl2", prefix: k.prefix, hash: k.hash, scopes: ["forms:write", "submissions:write"], rateLimit: 1000 } })
    const form = await prisma.form.create({
      data: {
        userId: ids.pro,
        workspaceId: ids.proWs,
        title: "Cross check",
        slug: `${P}-cross-${Date.now()}`,
        draftSchema: { version: 1, fields: FIELDS, logic: [] },
        themeConfig: {},
        settings: {
          respondentEmailFieldId: "f_email",
          autoReply: { enabled: true, subject: "Built-in {{name}}", heading: "Built-in heading", body: "x", includeAnswers: false, fromName: "", replyTo: "", templateId: ids.foreignTpl },
        },
      },
    })
    await call(publishRoute.POST, "POST", `/api/v1/forms/${form.id}/publish`, { key: k.raw, params: { formId: form.id } })
    const res = await call(submissionsRoute.POST, "POST", `/api/v1/forms/${form.id}/submissions`, { key: k.raw, params: { formId: form.id }, body: { data: { name: "Grace", email: `${P}-respondent@formstudio.test` } } })
    assert.equal(res.status, 201)
    const subId = ((await res.json()) as { data: { id: string } }).data.id
    let row = null
    for (let i = 0; i < 40 && !row; i++) {
      row = await prisma.emailOutbox.findFirst({ where: { source: `receipt:${subId}` } })
      if (!row) await new Promise((r) => setTimeout(r, 100))
    }
    assert.ok(row)
    assert.equal(row.subject, "Built-in Grace")
    assert.ok(row.html.includes("Built-in heading") && !row.html.includes("FOREIGN TEMPLATE"))
    await prisma.emailOutbox.deleteMany({ where: { source: `receipt:${subId}` } })
  })

  it("reports which forms use a template", async () => {
    const usage = await templateUsage(ids.proWs)
    const used = usage.get(ids.tpl) ?? []
    assert.ok(used.includes("Studio enquiry · thank-you") && used.includes("Studio enquiry · notification"), JSON.stringify(used))
  })
})

describe("automation email step", () => {
  const baseEnv = (sent: unknown[]): ExecEnv => ({
    isTest: true,
    runId: "run_1",
    formId: "f",
    ownerId: "u",
    submissionId: null,
    allowPrivateNetwork: false,
    fetch,
    sleep: async () => undefined,
    async sendEmail(input) {
      sent.push(input)
      return { id: "o1", status: "LOGGED" }
    },
    notify: async () => ({ id: "n" }),
    updateSubmission: async () => ({ status: "NEW", tags: [], notes: null }),
    requestApproval: async () => ({ notified: [] }),
  })
  const node = (templateId: string | null) => ({
    id: "email_1",
    type: "email" as const,
    position: { x: 0, y: 0 },
    data: { label: "Email", config: { to: "{{trigger.data.email}}", subject: "Hi {{trigger.data.name}}", body: "Line one", templateId } },
  })
  const scope = { trigger: { data: { email: "a@b.co", name: "Ada" } } }

  it("renders through the template when one is chosen", async () => {
    const sent: { html: string; text?: string; subject: string }[] = []
    const env = baseEnv(sent)
    env.renderEmailTemplate = async (id, input) => ({ subject: `${input.subject}!`, html: `<p>TEMPLATE ${id} ${input.message}</p>`, text: "T", template: "Brand" })
    const r = await executeNode(node("tpl_1") as never, scope, env)
    assert.equal(sent[0].html, "<p>TEMPLATE tpl_1 Line one</p>")
    assert.equal(sent[0].subject, "Hi Ada!")
    assert.equal(sent[0].text, "T")
    assert.equal((r as { input: { template: string } }).input.template, "Brand")
  })

  it("falls back to the plain design when the template is unavailable", async () => {
    const sent: { html: string }[] = []
    const env = baseEnv(sent)
    env.renderEmailTemplate = async () => null
    const r = await executeNode(node("gone") as never, scope, env)
    assert.ok(sent[0].html.includes("Line one"))
    assert.match(JSON.stringify((r as { output: unknown }).output), /plain design/)
  })
})

describe("image hosting", () => {
  it("serves uploaded images with locked-down headers", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
    const asset = await prisma.workspaceAsset.create({ data: { workspaceId: ids.proWs, name: "logo.png", mime: "image/png", size: bytes.length, sha256: "a".repeat(64), data: bytes } })
    const res = await assetRoute.GET(new Request("http://localhost/x"), { params: Promise.resolve({ assetId: asset.id, name: "logo.png" }) })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get("content-type"), "image/png")
    assert.equal(res.headers.get("x-content-type-options"), "nosniff")
    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'/)
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes)
    const missing = await assetRoute.GET(new Request("http://localhost/x"), { params: Promise.resolve({ assetId: "doesnotexist123", name: "x.png" }) })
    assert.equal(missing.status, 404)
    const bad = await assetRoute.GET(new Request("http://localhost/x"), { params: Promise.resolve({ assetId: "../../etc", name: "x" }) })
    assert.equal(bad.status, 404)
  })
})
