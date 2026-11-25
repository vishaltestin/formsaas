"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { escapeHtml } from "@/lib/email/escape"
import { appUrl } from "@/lib/format"
import { sendEmail } from "@/lib/notify"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/public-form"
import { canGrantRole, canManageMember, ROLE_LABELS, WORKSPACE_ROLES, type WorkspaceRole } from "@/lib/rbac/policy"
import { switchWorkspace } from "@/app/actions/workspaces"
import { acceptInviteForUser } from "@/lib/rbac/invites"
import { assertWorkspacePermission, audit, ForbiddenError } from "@/lib/rbac/server"
import { randomToken, sha256 } from "@/lib/signing"
import { assertUser } from "@/lib/session"

const id = z.string().min(1).max(64)
const INVITE_TTL_DAYS = 7
const nonOwnerRole = z.enum(WORKSPACE_ROLES).refine((r) => r !== "OWNER", "Use “Transfer ownership” to change the owner")

function revalidateTeam() {
  revalidatePath("/dashboard/team")
}

function firstIssue(e: unknown) {
  return e instanceof z.ZodError ? { ok: false as const, error: e.issues[0]?.message ?? "Invalid input" } : fail(e)
}

/** Loads a member of `workspaceId` (never another workspace's). */
async function memberIn(workspaceId: string, memberId: string) {
  const m = await prisma.workspaceMember.findFirst({
    where: { id: id.parse(memberId), workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!m) throw new Error("Member not found.")
  return m
}

async function groupIdsIn(workspaceId: string, ids: string[]) {
  if (ids.length === 0) return []
  const rows = await prisma.workspaceGroup.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true } })
  if (rows.length !== new Set(ids).size) throw new Error("One of the selected groups doesn't belong to this workspace.")
  return rows.map((r) => r.id)
}

function inviteLink(token: string) {
  return `${appUrl()}/invite/${token}`
}

async function sendInviteEmail(input: { workspaceId: string; workspaceName: string; inviter: string; email: string; role: WorkspaceRole; token: string; expiresAt: Date }) {
  const link = inviteLink(input.token)
  const ws = escapeHtml(input.workspaceName)
  return sendEmail({
    to: [input.email],
    subject: `${input.inviter} invited you to ${input.workspaceName} on Digital Fueled`,
    html: `<p>${escapeHtml(input.inviter)} invited you to join <strong>${ws}</strong> as <strong>${ROLE_LABELS[input.role]}</strong>.</p><p><a href="${link}">Accept the invitation</a></p><p style="color:#666">Sign in or create an account with <strong>${escapeHtml(input.email)}</strong> to accept. The link expires on ${input.expiresAt.toDateString()} and can be used once.</p>`,
    text: `${input.inviter} invited you to join ${input.workspaceName} as ${ROLE_LABELS[input.role]}.\n\nAccept: ${link}\n\nSign in with ${input.email}. Expires ${input.expiresAt.toDateString()}.`,
    source: `invite:${input.workspaceId}`,
    workspaceId: input.workspaceId,
  })
}

// ─── Invitations ────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  role: nonOwnerRole,
  groupIds: z.array(id).max(20).default([]),
})

/**
 * Invites someone by email. The single-use token is random (192 bits), only
 * its SHA-256 is stored, it expires in 7 days and can only be accepted by an
 * account with the invited email address.
 */
export async function inviteMember(
  workspaceId: string,
  input: z.input<typeof inviteSchema>
): Promise<ActionResult<{ url: string; emailed: boolean; emailNote: string | null }>> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "members.invite")
    const data = inviteSchema.parse(input)
    const grant = canGrantRole(membership.role, data.role)
    if (!grant.ok) throw new ForbiddenError(grant.reason)
    if (!(await rateLimit(`invite:${membership.workspaceId}`, 30, 60 * 60_000))) throw new Error("Too many invitations this hour. Try again later.")

    const existing = await prisma.workspaceMember.findFirst({ where: { workspaceId: membership.workspaceId, user: { email: data.email } } })
    if (existing) throw new Error("That person is already a member of this workspace.")
    const pending = await prisma.workspaceInvite.count({ where: { workspaceId: membership.workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })
    if (pending >= 100) throw new Error("This workspace has 100 pending invitations. Revoke some first.")
    const groupIds = await groupIdsIn(membership.workspaceId, data.groupIds)

    const token = randomToken(24)
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000)
    await prisma.$transaction([
      // A fresh invite supersedes any older pending one for the same address.
      prisma.workspaceInvite.updateMany({
        where: { workspaceId: membership.workspaceId, email: data.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.workspaceInvite.create({
        data: { workspaceId: membership.workspaceId, email: data.email, role: data.role, groupIds, tokenHash: sha256(token), invitedById: user.id, expiresAt },
      }),
    ])
    const mail = await sendInviteEmail({ workspaceId: membership.workspaceId, workspaceName: membership.workspaceName, inviter: user.name || user.email || "A teammate", email: data.email, role: data.role, token, expiresAt })
    await audit({ workspaceId: membership.workspaceId, actorId: user.id, action: "member.invited", summary: `Invited ${data.email} as ${ROLE_LABELS[data.role]}`, targetType: "invite", metadata: { email: data.email, role: data.role } })
    revalidateTeam()
    return ok({
      url: inviteLink(token),
      emailed: mail.sent,
      emailNote: mail.sent ? null : mail.reason === "not-configured" ? "No email provider is configured — share the link yourself." : (mail.error ?? "The email could not be sent."),
    })
  } catch (e) {
    return firstIssue(e)
  }
}

/** Re-issues the link (new token, new 7-day expiry) and emails it again. */
export async function resendInvite(workspaceId: string, inviteId: string): Promise<ActionResult<{ url: string; emailed: boolean }>> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "members.invite")
    const invite = await prisma.workspaceInvite.findFirst({ where: { id: id.parse(inviteId), workspaceId: membership.workspaceId, acceptedAt: null, revokedAt: null } })
    if (!invite) throw new Error("Invitation not found.")
    const grant = canGrantRole(membership.role, invite.role)
    if (!grant.ok) throw new ForbiddenError(grant.reason)
    if (!(await rateLimit(`invite:${membership.workspaceId}`, 30, 60 * 60_000))) throw new Error("Too many invitations this hour. Try again later.")
    const token = randomToken(24)
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000)
    await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { tokenHash: sha256(token), expiresAt } })
    const mail = await sendInviteEmail({ workspaceId: membership.workspaceId, workspaceName: membership.workspaceName, inviter: user.name || user.email || "A teammate", email: invite.email, role: invite.role, token, expiresAt })
    revalidateTeam()
    return ok({ url: inviteLink(token), emailed: mail.sent })
  } catch (e) {
    return fail(e)
  }
}

export async function revokeInvite(workspaceId: string, inviteId: string): Promise<ActionResult> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "members.invite")
    const invite = await prisma.workspaceInvite.findFirst({ where: { id: id.parse(inviteId), workspaceId: membership.workspaceId, acceptedAt: null, revokedAt: null } })
    if (!invite) throw new Error("Invitation not found.")
    await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } })
    await audit({ workspaceId: membership.workspaceId, actorId: user.id, action: "member.invite_revoked", summary: `Revoked the invitation for ${invite.email}`, targetType: "invite", targetId: invite.id })
    revalidateTeam()
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}

/**
 * Accepts an invitation for the signed-in account. The account email (read
 * from the DB, not the session) must equal the invited address.
 */
export async function acceptInvite(token: string): Promise<ActionResult<{ workspaceId: string }>> {
  try {
    const sessionUser = await assertUser()
    const { workspaceId } = await acceptInviteForUser(sessionUser.id, z.string().min(20).max(100).parse(token))
    await switchWorkspace(workspaceId)
    return ok({ workspaceId })
  } catch (e) {
    return fail(e)
  }
}

// ─── Members ────────────────────────────────────────────────────────────────

export async function changeMemberRole(workspaceId: string, memberId: string, role: WorkspaceRole): Promise<ActionResult<{ role: WorkspaceRole }>> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "members.manage")
    const next = nonOwnerRole.parse(role)
    const target = await memberIn(membership.workspaceId, memberId)
    const manage = canManageMember(membership.role, target.role, { self: target.userId === user.id })
    if (!manage.ok) throw new ForbiddenError(manage.reason)
    const grant = canGrantRole(membership.role, next)
    if (!grant.ok) throw new ForbiddenError(grant.reason)
    if (target.role === next) return ok({ role: next })
    await prisma.workspaceMember.update({ where: { id: target.id }, data: { role: next } })
    await audit({
      workspaceId: membership.workspaceId,
      actorId: user.id,
      action: "member.role_changed",
      summary: `Changed ${target.user.name || target.user.email} from ${ROLE_LABELS[target.role]} to ${ROLE_LABELS[next]}`,
      targetType: "member",
      targetId: target.id,
      metadata: { from: target.role, to: next },
    })
    revalidateTeam()
    return ok({ role: next })
  } catch (e) {
    return firstIssue(e)
  }
}

/** Removes a member: their form grants and group seats go with the membership; their API keys here are revoked. */
export async function removeMember(workspaceId: string, memberId: string): Promise<ActionResult> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "members.manage")
    const target = await memberIn(membership.workspaceId, memberId)
    const manage = canManageMember(membership.role, target.role, { self: target.userId === user.id })
    if (!manage.ok) throw new ForbiddenError(manage.reason)
    await prisma.$transaction([
      prisma.workspaceMember.delete({ where: { id: target.id } }),
      prisma.apiKey.updateMany({ where: { userId: target.userId, workspaceId: membership.workspaceId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ])
    await audit({ workspaceId: membership.workspaceId, actorId: user.id, action: "member.removed", summary: `Removed ${target.user.name || target.user.email} (${ROLE_LABELS[target.role]})`, targetType: "member", targetId: target.id })
    revalidateTeam()
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}

// ─── Groups ─────────────────────────────────────────────────────────────────

const groupSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(80),
  description: z.string().trim().max(300).default(""),
})

export async function createGroup(workspaceId: string, input: z.input<typeof groupSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "groups.manage")
    const data = groupSchema.parse(input)
    const count = await prisma.workspaceGroup.count({ where: { workspaceId: membership.workspaceId } })
    if (count >= 50) throw new Error("A workspace can have up to 50 groups.")
    const dupe = await prisma.workspaceGroup.findUnique({ where: { workspaceId_name: { workspaceId: membership.workspaceId, name: data.name } } })
    if (dupe) throw new Error("A group with that name already exists.")
    const group = await prisma.workspaceGroup.create({ data: { workspaceId: membership.workspaceId, name: data.name, description: data.description || null } })
    await audit({ workspaceId: membership.workspaceId, actorId: user.id, action: "group.created", summary: `Created group “${data.name}”`, targetType: "group", targetId: group.id })
    revalidateTeam()
    return ok({ id: group.id })
  } catch (e) {
    return firstIssue(e)
  }
}

export async function updateGroup(workspaceId: string, groupId: string, input: z.input<typeof groupSchema>): Promise<ActionResult> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "groups.manage")
    const data = groupSchema.parse(input)
    const group = await prisma.workspaceGroup.findFirst({ where: { id: id.parse(groupId), workspaceId: membership.workspaceId } })
    if (!group) throw new Error("Group not found.")
    const dupe = await prisma.workspaceGroup.findFirst({ where: { workspaceId: membership.workspaceId, name: data.name, NOT: { id: group.id } } })
    if (dupe) throw new Error("A group with that name already exists.")
    await prisma.workspaceGroup.update({ where: { id: group.id }, data: { name: data.name, description: data.description || null } })
    await audit({ workspaceId: membership.workspaceId, actorId: user.id, action: "group.updated", summary: `Updated group “${data.name}”`, targetType: "group", targetId: group.id })
    revalidateTeam()
    return ok(undefined)
  } catch (e) {
    return firstIssue(e)
  }
}

export async function deleteGroup(workspaceId: string, groupId: string): Promise<ActionResult> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "groups.manage")
    const group = await prisma.workspaceGroup.findFirst({ where: { id: id.parse(groupId), workspaceId: membership.workspaceId } })
    if (!group) throw new Error("Group not found.")
    await prisma.workspaceGroup.delete({ where: { id: group.id } })
    await audit({ workspaceId: membership.workspaceId, actorId: user.id, action: "group.deleted", summary: `Deleted group “${group.name}” and its form access`, targetType: "group", targetId: group.id })
    revalidateTeam()
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}

/** Replaces a group's members. Every member id must belong to the same workspace. */
export async function setGroupMembers(workspaceId: string, groupId: string, memberIds: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "groups.manage")
    const ids = Array.from(new Set(z.array(id).max(500).parse(memberIds)))
    const group = await prisma.workspaceGroup.findFirst({ where: { id: id.parse(groupId), workspaceId: membership.workspaceId } })
    if (!group) throw new Error("Group not found.")
    const valid = await prisma.workspaceMember.count({ where: { workspaceId: membership.workspaceId, id: { in: ids } } })
    if (valid !== ids.length) throw new Error("Some selected people aren't members of this workspace.")
    await prisma.$transaction([
      prisma.workspaceGroupMember.deleteMany({ where: { groupId: group.id, memberId: { notIn: ids } } }),
      prisma.workspaceGroupMember.createMany({ data: ids.map((memberId) => ({ groupId: group.id, memberId })), skipDuplicates: true }),
    ])
    await audit({ workspaceId: membership.workspaceId, actorId: user.id, action: "group.members_set", summary: `Set “${group.name}” to ${ids.length} member${ids.length === 1 ? "" : "s"}`, targetType: "group", targetId: group.id })
    revalidateTeam()
    return ok({ count: ids.length })
  } catch (e) {
    return fail(e)
  }
}
