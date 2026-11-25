/**
 * Idempotent seed: plans, owner contact settings, demo accounts, two published
 * demo forms with realistic submissions + analytics events over the last 30 days.
 *
 *   npm run db:seed        (or: npx prisma db seed --config prisma7.config.ts)
 */
import "dotenv/config"

import { createHash } from "node:crypto"

import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import bcrypt from "bcryptjs"

import { PrismaClient, type EventSource, type SubmissionStatus } from "../generated/prisma/client"
import { evaluateLogic, fromKeyedData, type FormSchema, type FormValues } from "../lib/form-engine"
import { DEFAULT_OWNER_CONTACT, DEFAULT_PLANS } from "../lib/plans"
import { getTemplate } from "../lib/templates"
import { TEMPLATE_STARTERS } from "../lib/email/template-library"
import { seedV2 } from "./seed-v2"

const url = new URL(process.env.DATABASE_URL ?? "mysql://root@127.0.0.1:3306/formstudio")
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: 5,
    allowPublicKeyRetrieval: true,
  }),
})

/* deterministic PRNG so re-seeding yields the same dataset */
let seedState = 20261123
function rand() {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296
  return seedState / 4294967296
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
const chance = (p: number) => rand() < p
const between = (a: number, b: number) => Math.floor(a + rand() * (b - a + 1))

function daysAgo(days: number, hourJitter = true) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  if (hourJitter) d.setHours(between(7, 22), between(0, 59), between(0, 59))
  return d
}

const FIRST = ["Ada", "Grace", "Alan", "Linus", "Margaret", "Katherine", "Dennis", "Barbara", "Ken", "Radia", "Tim", "Hedy", "Guido", "Frances", "Edsger", "Sophie", "Priya", "Mateo", "Yuki", "Amara"]
const LAST = ["Lovelace", "Hopper", "Turing", "Torvalds", "Hamilton", "Johnson", "Ritchie", "Liskov", "Thompson", "Perlman", "Berners-Lee", "Lamarr", "van Rossum", "Allen", "Dijkstra", "Wilson", "Sharma", "García", "Tanaka", "Okafor"]
const COMPANIES = ["Northwind", "Globex", "Initech", "Umbrella Labs", "Hooli", "Stark Industries", "Wayne Analytics", "Acme Corp", "Soylent", "Vandelay", "Pied Piper", "Cyberdyne"]
const REFERRERS = ["https://www.google.com/", "https://www.linkedin.com/", "https://news.ycombinator.com/", "https://twitter.com/", "", "https://www.producthunt.com/"]
const UTM = [
  { source: "google", medium: "cpc", campaign: "q4-search" },
  { source: "linkedin", medium: "social", campaign: "launch" },
  { source: "newsletter", medium: "email", campaign: "nov-digest" },
  { source: "", medium: "", campaign: "" },
]
const SOURCES: EventSource[] = ["DIRECT", "DIRECT", "DIRECT", "IFRAME", "IFRAME", "POPUP", "DRAWER", "SCRIPT"]
const DEVICES = ["desktop", "desktop", "desktop", "mobile", "mobile", "tablet"]
const BROWSERS = ["Chrome", "Safari", "Firefox", "Edge"]

const sessionId = () => `seed_${Math.floor(rand() * 1e12).toString(36)}`
const ipHash = () => createHash("sha256").update(`ip-${rand()}`).digest("hex").slice(0, 32)

function tinyAttachment() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='140'><rect width='240' height='140' fill='#f4f4f5'/><rect x='16' y='16' width='208' height='24' rx='4' fill='#e4e4e7'/><rect x='16' y='52' width='140' height='12' rx='3' fill='#d4d4d8'/><rect x='16' y='72' width='180' height='12' rx='3' fill='#d4d4d8'/><text x='16' y='120' font-family='Arial' font-size='14' fill='#71717a'>screenshot.png</text></svg>`
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  return { name: "screenshot.svg", size: svg.length, type: "image/svg+xml", dataUrl }
}

async function upsertPlans() {
  const plans: Record<string, string> = {}
  for (const p of DEFAULT_PLANS) {
    const row = await prisma.plan.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        priceLabel: p.priceLabel,
        sortOrder: p.sortOrder,
        limits: p.limits as object,
        features: p.features as object,
      },
    })
    plans[p.slug] = row.id
  }
  return plans
}

async function upsertSettings() {
  for (const [key, value] of Object.entries(DEFAULT_OWNER_CONTACT)) {
    await prisma.systemSetting.upsert({ where: { key }, update: {}, create: { key, value } })
  }
}

async function upsertUser(email: string, name: string, password: string, role: "USER" | "ADMIN") {
  const hash = await bcrypt.hash(password, 10)
  return prisma.user.upsert({
    where: { email },
    update: { name, role, password: hash },
    create: { email, name, role, password: hash, emailVerified: new Date() },
  })
}

/** Personal workspace with the same deterministic ids the v6 migration backfill uses. */
async function personalWorkspace(userId: string, name: string) {
  const id = `wsp_${userId}`
  await prisma.workspace.upsert({
    where: { id },
    update: {},
    create: { id, name: `${name}'s workspace`, ownerId: userId, members: { create: { id: `wsm_${userId}`, userId, role: "OWNER" } } },
  })
  return id
}

async function upsertMember(workspaceId: string, userId: string, role: "ADMIN" | "EDITOR" | "MEMBER") {
  return prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    update: { role },
    create: { workspaceId, userId, role },
  })
}

interface SeedFormInput {
  templateId: string
  slug: string
  title: string
  userId: string
  workspaceId: string
  submissions: number
  abandoned: number
  makeData: () => Record<string, unknown>
}

async function seedForm(input: SeedFormInput) {
  const template = getTemplate(input.templateId)
  if (!template) throw new Error(`Template ${input.templateId} missing`)

  await prisma.form.deleteMany({ where: { slug: input.slug } })

  const publishedAt = daysAgo(32, false)
  const form = await prisma.form.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      createdById: input.userId,
      title: input.title,
      description: template.description,
      slug: input.slug,
      mode: template.mode,
      status: "PUBLISHED",
      draftSchema: template.schema as object,
      publishedSchema: template.schema as object,
      themeConfig: template.theme as object,
      settings: template.settings as object,
      publishedAt,
      createdAt: daysAgo(35, false),
      versions: {
        create: {
          versionNumber: 1,
          schema: template.schema as object,
          themeConfig: template.theme as object,
          createdAt: publishedAt,
        },
      },
    },
  })

  const schema = template.schema
  const events: {
    formId: string
    sessionId: string
    type: "VIEW" | "START" | "STEP_COMPLETE" | "SUBMIT"
    stepIndex: number | null
    source: EventSource
    createdAt: Date
  }[] = []

  const statuses: SubmissionStatus[] = ["NEW", "NEW", "NEW", "REVIEWED", "REVIEWED", "FLAGGED", "ARCHIVED"]

  for (let i = 0; i < input.submissions; i++) {
    const created = daysAgo(between(0, 29))
    const sid = sessionId()
    const source = pick(SOURCES)
    const data = input.makeData()
    const values: FormValues = fromKeyedData(schema, data)
    const logic = evaluateLogic(schema, values, { mode: template.mode })
    const utm = pick(UTM)
    const completion = between(35, 420)

    await prisma.submission.create({
      data: {
        formId: form.id,
        data: data as object,
        status: pick(statuses),
        notes: chance(0.2) ? "Followed up via email — waiting on reply." : null,
        createdAt: created,
        metadata: {
          device: pick(DEVICES),
          browser: pick(BROWSERS),
          referrer: pick(REFERRERS),
          utm,
          completionSeconds: completion,
          embedType: source,
          ipHash: ipHash(),
          userAgent: "Mozilla/5.0 (seed)",
        },
      },
    })

    const start = new Date(created.getTime() - completion * 1000)
    events.push({ formId: form.id, sessionId: sid, type: "VIEW", stepIndex: null, source, createdAt: new Date(start.getTime() - 4000) })
    events.push({ formId: form.id, sessionId: sid, type: "START", stepIndex: 0, source, createdAt: start })
    logic.path.forEach((step, idx) => {
      events.push({
        formId: form.id,
        sessionId: sid,
        type: "STEP_COMPLETE",
        stepIndex: step,
        source,
        createdAt: new Date(start.getTime() + ((idx + 1) * completion * 1000) / (logic.path.length + 1)),
      })
    })
    events.push({ formId: form.id, sessionId: sid, type: "SUBMIT", stepIndex: null, source, createdAt: created })
  }

  const stepCount = logic0Steps(schema)
  for (let i = 0; i < input.abandoned; i++) {
    const created = daysAgo(between(0, 29))
    const sid = sessionId()
    const source = pick(SOURCES)
    events.push({ formId: form.id, sessionId: sid, type: "VIEW", stepIndex: null, source, createdAt: created })
    if (chance(0.55)) {
      events.push({ formId: form.id, sessionId: sid, type: "START", stepIndex: 0, source, createdAt: new Date(created.getTime() + 8000) })
      const reached = between(0, Math.max(0, stepCount - 2))
      for (let s = 0; s < reached; s++)
        events.push({ formId: form.id, sessionId: sid, type: "STEP_COMPLETE", stepIndex: s, source, createdAt: new Date(created.getTime() + 20000 * (s + 1)) })
    }
  }

  await prisma.formEvent.createMany({ data: events })
  return form
}

function logic0Steps(schema: FormSchema) {
  return evaluateLogic(schema, {}, { mode: "STEPPER" }).steps.length
}

function leadData() {
  const first = pick(FIRST)
  const last = pick(LAST)
  const company = pick(COMPANIES)
  const size = pick(["1_10", "11_50", "51_200", "200"])
  const budget = pick(["under_100", "100_1_000", "100_1_000", "1_000"])
  const data: Record<string, unknown> = {
    first_name: first,
    last_name: last,
    work_email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + `@${company.toLowerCase().replace(/[^a-z]/g, "")}.com`,
    company,
    website: `https://${company.toLowerCase().replace(/[^a-z]/g, "")}.com`,
    team_size: size,
    use_case: ["lead_capture", "customer_feedback", "internal_workflows", "surveys_research"].filter(() => chance(0.5)).slice(0, 3),
    budget,
    notes: chance(0.5) ? pick(["Need HubSpot integration.", "Evaluating against Typeform.", "Security review required.", "Looking to migrate 40 forms."]) : "",
    utm_source: pick(["google", "linkedin", "newsletter", ""]),
  }
  if ((data.use_case as string[]).length === 0) data.use_case = ["lead_capture"]
  if (size === "51_200" || size === "200") data.seats = between(60, 900)
  if (budget === "under_100") data.lead_tier = "self-serve"
  else {
    data.needs_sso = chance(0.5)
    data.timeline = daysAgo(-between(10, 90), false).toISOString().slice(0, 10)
    if (budget === "1_000") data.lead_tier = "enterprise"
  }
  return data
}

function contactData() {
  const first = pick(FIRST)
  const last = pick(LAST)
  const company = pick(COMPANIES)
  const topic = pick(["billing", "technical_issue", "feature_request", "partnership"])
  return {
    full_name: `${first} ${last}`,
    email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + "@example.com",
    phone: chance(0.6) ? `+1 555 ${between(100, 999)} ${between(1000, 9999)}` : "",
    company,
    topic,
    priority: pick(["low", "normal", "normal", "urgent"]),
    message: pick([
      "Our team can't find where to export responses as CSV — could you point us in the right direction?",
      "We'd love a native Salesforce integration. Is that on the roadmap for next quarter?",
      "I was charged twice for the Pro plan this month, please help us sort out the invoice.",
      "The embed on our pricing page isn't resizing properly on Safari mobile. Screenshot attached.",
      "Interested in a co-marketing partnership around form analytics. Who should we talk to?",
    ]),
    ...(chance(0.35) ? { attachment: tinyAttachment() } : {}),
    consent: true,
  }
}

async function main() {
  console.log("› Seeding plans & settings")
  const plans = await upsertPlans()
  await upsertSettings()

  console.log("› Seeding users")
  const admin = await upsertUser("admin@formstudio.dev", "Avery Admin", "Admin@12345", "ADMIN")
  const demo = await upsertUser("demo@formstudio.dev", "Dana Demo", "Demo@12345", "USER")
  const free = await upsertUser("maya@northwind.dev", "Maya Chen", "Maya@12345", "USER")
  const sam = await upsertUser("sam@formstudio.dev", "Sam Support", "Sam@12345", "USER")
  const lee = await upsertUser("lee@formstudio.dev", "Lee Editor", "Lee@12345", "USER")
  // Sam and Lee only belong to Dana's team workspace, so it is what they land in.
  await prisma.workspace.deleteMany({ where: { ownerId: { in: [sam.id, lee.id] } } })
  const [, demoWs, freeWs] = await Promise.all([
    personalWorkspace(admin.id, "Avery Admin"),
    personalWorkspace(demo.id, "Dana Demo"),
    personalWorkspace(free.id, "Maya Chen"),
  ])

  await prisma.subscription.upsert({
    where: { userId: admin.id },
    update: { planId: plans.enterprise, status: "ACTIVE" },
    create: { userId: admin.id, planId: plans.enterprise, status: "ACTIVE", assignedByAdminId: admin.id, adminNotes: "Owner account" },
  })
  await prisma.subscription.upsert({
    where: { userId: demo.id },
    update: { planId: plans.pro, status: "ACTIVE" },
    create: {
      userId: demo.id,
      planId: plans.pro,
      status: "ACTIVE",
      assignedByAdminId: admin.id,
      expiresAt: daysAgo(-180, false),
      adminNotes: "Demo workspace — Pro trial extended for evaluation.",
    },
  })
  await prisma.subscription.upsert({
    where: { userId: free.id },
    update: { planId: plans.free },
    create: { userId: free.id, planId: plans.free, status: "ACTIVE" },
  })

  console.log("› Seeding demo forms, submissions & events")
  const lead = await seedForm({
    templateId: "saas-lead-qualification",
    slug: "lead-qualification",
    title: "SaaS Lead Qualification",
    userId: demo.id,
    workspaceId: demoWs,
    submissions: 26,
    abandoned: 70,
    makeData: leadData,
  })
  const contact = await seedForm({
    templateId: "contact-support-inquiry",
    slug: "contact-support",
    title: "Contact & Support Inquiry",
    userId: demo.id,
    workspaceId: demoWs,
    submissions: 18,
    abandoned: 40,
    makeData: contactData,
  })

  // A draft form for the free user so the admin table shows usage.
  await prisma.form.deleteMany({ where: { slug: "northwind-feedback" } })
  const nps = getTemplate("customer-nps-feedback")!
  await prisma.form.create({
    data: {
      userId: free.id,
      workspaceId: freeWs,
      createdById: free.id,
      title: "Northwind Customer Pulse",
      slug: "northwind-feedback",
      mode: nps.mode,
      status: "DRAFT",
      draftSchema: { ...nps.schema, logic: [] } as object,
      themeConfig: nps.theme as object,
      settings: nps.settings as object,
    },
  })

  console.log("› Seeding team: members, groups & form access")
  // Dana's workspace is the RBAC demo: Lee is an Editor with Edit on the lead form,
  // Sam is a Member who only sees Contact & Support through the "Support desk" group.
  await prisma.workspace.update({ where: { id: demoWs }, data: { name: "Dana Demo's workspace" } })
  const leeM = await upsertMember(demoWs, lee.id, "EDITOR")
  const samM = await upsertMember(demoWs, sam.id, "MEMBER")
  const support = await prisma.workspaceGroup.upsert({
    where: { workspaceId_name: { workspaceId: demoWs, name: "Support desk" } },
    update: {},
    create: { workspaceId: demoWs, name: "Support desk", description: "Triage inbound support requests" },
  })
  const sales = await prisma.workspaceGroup.upsert({
    where: { workspaceId_name: { workspaceId: demoWs, name: "Sales" } },
    update: {},
    create: { workspaceId: demoWs, name: "Sales", description: "Qualifies inbound leads" },
  })
  await prisma.workspaceGroupMember.createMany({
    data: [
      { groupId: support.id, memberId: samM.id },
      { groupId: sales.id, memberId: leeM.id },
    ],
    skipDuplicates: true,
  })
  await prisma.formAccess.createMany({
    data: [
      { formId: contact.id, groupId: support.id, level: "REVIEW", grantedById: demo.id },
      { formId: lead.id, groupId: sales.id, level: "VIEW", grantedById: demo.id },
      { formId: lead.id, memberId: leeM.id, level: "EDIT", grantedById: demo.id },
    ],
    skipDuplicates: true,
  })
  await prisma.auditLog.deleteMany({ where: { workspaceId: demoWs } })
  await prisma.auditLog.createMany({
    data: [
      { workspaceId: demoWs, actorId: demo.id, action: "member.added", targetType: "member", targetId: leeM.id, summary: "Added Lee Editor as Editor", createdAt: daysAgo(9, false) },
      { workspaceId: demoWs, actorId: demo.id, action: "member.added", targetType: "member", targetId: samM.id, summary: "Added Sam Support as Member", createdAt: daysAgo(8, false) },
      { workspaceId: demoWs, actorId: demo.id, action: "form.access_granted", targetType: "form", targetId: contact.id, summary: "Gave Support desk Review access to “Contact & Support Inquiry”", createdAt: daysAgo(8, false) },
      { workspaceId: demoWs, actorId: demo.id, action: "form.access_granted", targetType: "form", targetId: lead.id, summary: "Gave Lee Editor Edit access to “SaaS Lead Qualification”", createdAt: daysAgo(7, false) },
    ],
  })

  console.log("› Seeding webhook & delivery logs")
  const hook = await prisma.webhook.create({
    data: {
      formId: lead.id,
      name: "CRM sync",
      url: "https://hooks.example.com/formstudio/leads",
      secret: "whsec_demo_9f3b2c1a",
      headers: { "X-Source": "formstudio" },
      isActive: false,
    },
  })
  for (let i = 0; i < 6; i++) {
    const ok = i % 3 !== 2
    await prisma.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        event: "submission.created",
        statusCode: ok ? 200 : 502,
        responseMs: between(80, 900),
        success: ok,
        payload: { event: "submission.created", formId: lead.id, sample: true },
        responseBody: ok ? '{"received":true}' : "Bad gateway",
        createdAt: daysAgo(i * 3),
      },
    })
  }

  console.log("› Seeding upgrade requests")
  await prisma.upgradeRequest.deleteMany({ where: { userId: { in: [free.id, demo.id] } } })
  await prisma.upgradeRequest.create({
    data: {
      userId: free.id,
      requestedPlanId: plans.pro,
      contactEmail: "maya@northwind.dev",
      contactPhone: "+1 415 555 0199",
      message: "We're rolling out customer surveys across 3 regions and need conditional logic + webhooks.",
      status: "PENDING",
    },
  })
  await prisma.upgradeRequest.create({
    data: {
      userId: demo.id,
      requestedPlanId: plans.enterprise,
      contactEmail: "demo@formstudio.dev",
      message: "Interested in custom CSS and unlimited submissions for our agency clients.",
      status: "PENDING",
      createdAt: daysAgo(1),
    },
  })

  console.log("› Seeding a custom HTML email template")
  const branded = TEMPLATE_STARTERS.find((t) => t.id === "branded")!
  const brandedHtml = branded.html.replace("Your Company", "Dana Demo Co.")
  const demoTemplate = await prisma.emailTemplate.upsert({
    where: { workspaceId_name: { workspaceId: demoWs, name: "Dana Demo Co. letter" } },
    update: { html: brandedHtml, subject: branded.subject },
    create: { workspaceId: demoWs, name: "Dana Demo Co. letter", description: "Brand bar, answers and a receipt button.", subject: branded.subject, html: brandedHtml, createdById: demo.id },
  })
  // Contact form thank-you emails use it, so the demo shows a custom design end to end.
  const contactSettings = (await prisma.form.findUniqueOrThrow({ where: { id: contact.id }, select: { settings: true } })).settings as Record<string, unknown>
  await prisma.form.update({
    where: { id: contact.id },
    data: { settings: { ...contactSettings, autoReply: { ...((contactSettings.autoReply as object) ?? {}), templateId: demoTemplate.id } } },
  })

  console.log("› Seeding automations, runs, API keys & notifications")
  const v2 = await seedV2(prisma, {
    rand,
    demoUserId: demo.id,
    demoWorkspaceId: demoWs,
    leadFormId: lead.id,
    contactFormId: contact.id,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  })

  const counts = {
    ...v2,
    users: await prisma.user.count(),
    forms: await prisma.form.count(),
    submissions: await prisma.submission.count(),
    events: await prisma.formEvent.count(),
  }
  console.log("✔ Seed complete", counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
