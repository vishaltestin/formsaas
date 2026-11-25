/**
 * Team / RBAC integration tests against the real database: tenant isolation,
 * group & direct grants, invitations, API-key workspace binding and
 * per-workspace email credentials.
 */
import "dotenv/config"

import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"

import { NextRequest } from "next/server"

import * as formRoute from "../../app/api/v1/forms/[formId]/route"
import * as formsRoute from "../../app/api/v1/forms/route"
import { generateApiKey } from "../../lib/api/keys"
import { encryptSecret } from "../../lib/crypto/secrets"
import { loadWorkspaceRoute } from "../../lib/email/workspace-provider"
import { prisma } from "../../lib/prisma"
import { accessibleFormsWhere, getMembership, resolveFormAccess } from "../../lib/rbac/core"
import { acceptInviteForUser } from "../../lib/rbac/invites"
import { sha256 } from "../../lib/signing"

const P = "rbac-tests"
const emails = {
  owner: `${P}-owner@formstudio.test`,
  admin: `${P}-admin@formstudio.test`,
  editor: `${P}-editor@formstudio.test`,
  member: `${P}-member@formstudio.test`,
  outsider: `${P}-outsider@formstudio.test`,
  platform: `${P}-platform@formstudio.test`,
  invitee: `${P}-invitee@formstudio.test`,
}
const ids: Record<string, string> = {}

function formData(userId: string, workspaceId: string, title: string, createdById?: string) {
  return { userId, workspaceId, createdById: createdById ?? userId, title, slug: `${P}-${title.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}-${Math.round(Math.random() * 1e6)}`, draftSchema: { version: 1, fields: [], logic: [] }, themeConfig: {}, settings: {} }
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(emails) } }, select: { id: true } })
  const userIds = users.map((u) => u.id)
  await prisma.workspace.deleteMany({ where: { ownerId: { in: userIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
async function api(handler: unknown, path: string, key: string, params: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost:3000${path}`, { method: "GET", headers: { authorization: `Bearer ${key}` } })
  const res = await (handler as Handler)(req, { params: Promise.resolve(params) })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}
async function makeKey(userId: string, workspaceId: string) {
  const k = generateApiKey()
  await prisma.apiKey.create({ data: { userId, workspaceId, name: "rbac test", prefix: k.prefix, hash: k.hash, scopes: ["forms:read"], rateLimit: 1000 } })
  return k.raw
}

before(async () => {
  await cleanup()
  for (const [k, email] of Object.entries(emails)) ids[k] = (await prisma.user.create({ data: { email, name: k, role: k === "platform" ? "ADMIN" : "USER" } })).id

  const team = await prisma.workspace.create({ data: { name: `${P} team`, ownerId: ids.owner } })
  const other = await prisma.workspace.create({ data: { name: `${P} other`, ownerId: ids.outsider } })
  ids.team = team.id
  ids.other = other.id
  const add = async (key: string, ws: string, role: "OWNER" | "ADMIN" | "EDITOR" | "MEMBER") => (ids[`m_${key}`] = (await prisma.workspaceMember.create({ data: { workspaceId: ws, userId: ids[key], role } })).id)
  await add("owner", team.id, "OWNER")
  await add("admin", team.id, "ADMIN")
  await add("editor", team.id, "EDITOR")
  await add("member", team.id, "MEMBER")
  await add("outsider", other.id, "OWNER")

  ids.support = (await prisma.form.create({ data: formData(ids.owner, team.id, "Support") })).id
  ids.sales = (await prisma.form.create({ data: formData(ids.owner, team.id, "Sales") })).id
  ids.editorsOwn = (await prisma.form.create({ data: formData(ids.owner, team.id, "Editor draft", ids.editor) })).id
  ids.foreign = (await prisma.form.create({ data: formData(ids.outsider, other.id, "Foreign") })).id

  const group = await prisma.workspaceGroup.create({ data: { workspaceId: team.id, name: "Support desk" } })
  ids.group = group.id
  await prisma.workspaceGroupMember.create({ data: { groupId: group.id, memberId: ids.m_member } })
  await prisma.formAccess.create({ data: { formId: ids.support, groupId: group.id, level: "REVIEW" } })
  await prisma.formAccess.create({ data: { formId: ids.sales, memberId: ids.m_editor, level: "EDIT" } })
})

after(async () => {
  await cleanup()
  await prisma.$disconnect()
})

describe("form access resolution", () => {
  it("gives owners and admins Manage on every workspace form", async () => {
    for (const who of ["owner", "admin"]) for (const f of ["support", "sales", "editorsOwn"]) assert.equal((await resolveFormAccess(ids[who], ids[f]))?.level, "MANAGE", `${who} ${f}`)
  })
  it("resolves group and direct grants for members and editors", async () => {
    assert.equal((await resolveFormAccess(ids.member, ids.support))?.level, "REVIEW")
    assert.equal(await resolveFormAccess(ids.member, ids.sales), null)
    assert.equal((await resolveFormAccess(ids.editor, ids.sales))?.level, "EDIT")
    assert.equal((await resolveFormAccess(ids.editor, ids.editorsOwn))?.level, "MANAGE")
    assert.equal(await resolveFormAccess(ids.editor, ids.support), null)
  })
  it("lists exactly the accessible forms", async () => {
    const list = async (who: string) => {
      const m = (await getMembership(ids[who], ids.team))!
      return (await prisma.form.findMany({ where: accessibleFormsWhere(ids[who], m), select: { id: true } })).map((f) => f.id).sort()
    }
    assert.deepEqual(await list("member"), [ids.support])
    assert.deepEqual(await list("editor"), [ids.sales, ids.editorsOwn].sort())
    assert.deepEqual(await list("admin"), [ids.support, ids.sales, ids.editorsOwn].sort())
  })
  it("isolates tenants: no access across workspaces, and platform admins get no implicit access", async () => {
    assert.equal(await resolveFormAccess(ids.outsider, ids.support), null)
    assert.equal(await resolveFormAccess(ids.owner, ids.foreign), null)
    assert.equal(await resolveFormAccess(ids.platform, ids.support), null)
    assert.equal(await getMembership(ids.platform, ids.team), null)
  })
  it("ignores a grant whose group lives in another workspace", async () => {
    const foreignGroup = await prisma.workspaceGroup.create({ data: { workspaceId: ids.other, name: "Intruders" } })
    await prisma.workspaceGroupMember.create({ data: { groupId: foreignGroup.id, memberId: ids.m_outsider } })
    await prisma.formAccess.create({ data: { formId: ids.sales, groupId: foreignGroup.id, level: "MANAGE" } })
    assert.equal(await resolveFormAccess(ids.outsider, ids.sales), null)
    await prisma.workspaceGroup.delete({ where: { id: foreignGroup.id } })
  })
  it("drops access the moment someone leaves the group", async () => {
    await prisma.workspaceGroupMember.delete({ where: { groupId_memberId: { groupId: ids.group, memberId: ids.m_member } } })
    assert.equal(await resolveFormAccess(ids.member, ids.support), null)
    await prisma.workspaceGroupMember.create({ data: { groupId: ids.group, memberId: ids.m_member } })
    assert.equal((await resolveFormAccess(ids.member, ids.support))?.level, "REVIEW")
  })
  it("rejects malformed ids without querying", async () => {
    assert.equal(await resolveFormAccess(ids.owner, ""), null)
    assert.equal(await resolveFormAccess(ids.owner, "x".repeat(200)), null)
  })
})

describe("invitations", () => {
  async function invite(email: string, opts: { expiresAt?: Date; groupIds?: string[]; role?: "ADMIN" | "EDITOR" | "MEMBER" | "OWNER" } = {}) {
    const token = `tok_${Date.now()}_${Math.random().toString(36).slice(2)}_padding`
    await prisma.workspaceInvite.create({
      data: { workspaceId: ids.team, email, role: opts.role ?? "MEMBER", tokenHash: sha256(token), groupIds: opts.groupIds ?? [], invitedById: ids.owner, expiresAt: opts.expiresAt ?? new Date(Date.now() + 86400000) },
    })
    return token
  }

  it("only the invited address can accept", async () => {
    const token = await invite(emails.invitee)
    await assert.rejects(acceptInviteForUser(ids.outsider, token), /sent to/)
    assert.equal(await getMembership(ids.outsider, ids.team), null)
  })
  it("accepts once, joins listed groups of the same workspace only, and can't be replayed", async () => {
    const foreignGroup = await prisma.workspaceGroup.create({ data: { workspaceId: ids.other, name: "Not yours" } })
    const token = await invite(emails.invitee, { groupIds: [ids.group, foreignGroup.id] })
    const res = await acceptInviteForUser(ids.invitee, token)
    assert.equal(res.workspaceId, ids.team)
    const m = await getMembership(ids.invitee, ids.team)
    assert.equal(m?.role, "MEMBER")
    const seats = await prisma.workspaceGroupMember.findMany({ where: { memberId: res.memberId } })
    assert.deepEqual(seats.map((s) => s.groupId), [ids.group])
    assert.equal((await resolveFormAccess(ids.invitee, ids.support))?.level, "REVIEW")
    await assert.rejects(acceptInviteForUser(ids.invitee, token), /already been used/)
    await prisma.workspaceGroup.delete({ where: { id: foreignGroup.id } })
  })
  it("never creates an owner from an invite", async () => {
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: ids.team, userId: ids.invitee } })
    const token = await invite(emails.invitee, { role: "OWNER" })
    await acceptInviteForUser(ids.invitee, token)
    assert.equal((await getMembership(ids.invitee, ids.team))?.role, "MEMBER")
    assert.equal((await prisma.workspace.findUniqueOrThrow({ where: { id: ids.team } })).ownerId, ids.owner)
  })
  it("rejects expired, revoked and unknown tokens", async () => {
    const expired = await invite(emails.invitee, { expiresAt: new Date(Date.now() - 1000) })
    await assert.rejects(acceptInviteForUser(ids.invitee, expired), /expired/)
    const revoked = await invite(emails.invitee)
    await prisma.workspaceInvite.update({ where: { tokenHash: sha256(revoked) }, data: { revokedAt: new Date() } })
    await assert.rejects(acceptInviteForUser(ids.invitee, revoked), /no longer valid/)
    await assert.rejects(acceptInviteForUser(ids.invitee, "definitely-not-a-real-token-value"), /no longer valid/)
  })
})

describe("API keys are bound to a workspace", () => {
  it("lists only the key's workspace forms and 404s on other tenants", async () => {
    const key = await makeKey(ids.owner, ids.team)
    const list = await api(formsRoute.GET, "/api/v1/forms", key)
    assert.equal(list.status, 200)
    const listed = (list.json.data as { id: string }[]).map((f) => f.id)
    assert.ok(listed.includes(ids.support))
    assert.ok(!listed.includes(ids.foreign))
    assert.equal((await api(formRoute.GET, `/api/v1/forms/${ids.foreign}`, key, { formId: ids.foreign })).status, 404)
  })
  it("a member's key only reaches forms they were assigned", async () => {
    const key = await makeKey(ids.member, ids.team)
    assert.equal((await api(formRoute.GET, `/api/v1/forms/${ids.support}`, key, { formId: ids.support })).status, 200)
    assert.equal((await api(formRoute.GET, `/api/v1/forms/${ids.sales}`, key, { formId: ids.sales })).status, 404)
    const listed = ((await api(formsRoute.GET, "/api/v1/forms", key)).json.data as { id: string }[]).map((f) => f.id)
    assert.deepEqual(listed, [ids.support])
  })
  it("stops working when the key owner leaves the workspace", async () => {
    const key = await makeKey(ids.admin, ids.team)
    assert.equal((await api(formsRoute.GET, "/api/v1/forms", key)).status, 200)
    await prisma.workspaceMember.delete({ where: { id: ids.m_admin } })
    const res = await api(formsRoute.GET, "/api/v1/forms", key)
    assert.equal(res.status, 403)
    assert.equal((res.json.error as { code: string }).code, "workspace_access_revoked")
    ids.m_admin = (await prisma.workspaceMember.create({ data: { workspaceId: ids.team, userId: ids.admin, role: "ADMIN" } })).id
  })
})

describe("workspace email credentials", () => {
  it("decrypts only for the workspace that owns them", async () => {
    await prisma.workspaceEmailProvider.create({
      data: { workspaceId: ids.team, provider: "BREVO", enabled: true, fromEmail: "forms@team.test", fromName: "Team", config: { kind: "BREVO" }, secretCiphertext: encryptSecret("xkeysib-team-secret-0001", ids.team), secretHint: "0001" },
    })
    const route = await loadWorkspaceRoute(ids.team)
    assert.ok(route && route.ok)
    if (route?.ok) {
      assert.deepEqual(route.provider, { kind: "brevo", apiKey: "xkeysib-team-secret-0001" })
      assert.equal(route.from, `"Team" <forms@team.test>`)
    }
    const stored = await prisma.workspaceEmailProvider.findUniqueOrThrow({ where: { workspaceId: ids.team } })
    assert.ok(!stored.secretCiphertext.includes("team-secret"))

    // A ciphertext copied into another tenant's row fails authentication.
    await prisma.workspaceEmailProvider.create({
      data: { workspaceId: ids.other, provider: "BREVO", enabled: true, fromEmail: "x@other.test", config: { kind: "BREVO" }, secretCiphertext: stored.secretCiphertext },
    })
    const stolen = await loadWorkspaceRoute(ids.other)
    assert.ok(stolen && !stolen.ok)
  })
  it("falls back to the platform when switched off", async () => {
    await prisma.workspaceEmailProvider.update({ where: { workspaceId: ids.team }, data: { enabled: false } })
    assert.equal(await loadWorkspaceRoute(ids.team), null)
  })
})

describe("seeded team", () => {
  it("Sam (member) sees only Contact & Support; Lee (editor) can edit the lead form", async () => {
    const [sam, lee] = await Promise.all(["sam@formstudio.dev", "lee@formstudio.dev"].map((email) => prisma.user.findUnique({ where: { email } })))
    if (!sam || !lee) return // seed not loaded in this database
    const contact = await prisma.form.findFirstOrThrow({ where: { slug: "contact-support" } })
    const lead = await prisma.form.findFirstOrThrow({ where: { slug: "lead-qualification" } })
    assert.equal((await resolveFormAccess(sam.id, contact.id))?.level, "REVIEW")
    assert.equal(await resolveFormAccess(sam.id, lead.id), null)
    assert.equal((await resolveFormAccess(lee.id, lead.id))?.level, "EDIT")
  })
})
