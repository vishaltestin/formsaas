import "server-only"

import { prisma } from "@/lib/prisma"
import { ROLE_LABELS } from "@/lib/rbac/policy"
import { audit, ForbiddenError } from "@/lib/rbac/core"
import { sha256 } from "@/lib/signing"

/**
 * Accepts an invitation on behalf of `userId`. The account email (read from the
 * DB, never the session) must equal the invited address; the token is single
 * use (atomic claim), expires, and can be revoked. Groups listed on the invite
 * are re-validated against the workspace at acceptance time.
 */
export async function acceptInviteForUser(userId: string, rawToken: string): Promise<{ workspaceId: string; memberId: string }> {
  const invite = await prisma.workspaceInvite.findUnique({ where: { tokenHash: sha256(rawToken) } })
  if (!invite || invite.revokedAt) throw new Error("This invitation is no longer valid.")
  if (invite.acceptedAt) throw new Error("This invitation has already been used.")
  if (invite.expiresAt < new Date()) throw new Error("This invitation has expired. Ask for a new one.")
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true } })
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) throw new ForbiddenError(`This invitation was sent to ${invite.email}. Sign in with that address to accept it.`)

  const groupIds = Array.isArray(invite.groupIds) ? (invite.groupIds as unknown[]).filter((g): g is string => typeof g === "string") : []
  const validGroups = groupIds.length ? await prisma.workspaceGroup.findMany({ where: { workspaceId: invite.workspaceId, id: { in: groupIds } }, select: { id: true } }) : []

  const member = await prisma.$transaction(async (tx) => {
    const claimed = await tx.workspaceInvite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } })
    if (claimed.count !== 1) throw new Error("This invitation has already been used.")
    const existing = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } } })
    const m = existing ?? (await tx.workspaceMember.create({ data: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role === "OWNER" ? "MEMBER" : invite.role } }))
    if (validGroups.length) await tx.workspaceGroupMember.createMany({ data: validGroups.map((g) => ({ groupId: g.id, memberId: m.id })), skipDuplicates: true })
    return m
  })
  await audit({ workspaceId: invite.workspaceId, actorId: user.id, action: "member.joined", summary: `${user.name || user.email} joined as ${ROLE_LABELS[member.role]}`, targetType: "member", targetId: member.id })
  return { workspaceId: invite.workspaceId, memberId: member.id }
}
