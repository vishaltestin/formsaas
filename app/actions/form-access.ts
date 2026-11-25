"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { prisma } from "@/lib/prisma"
import { ACCESS_LEVELS, canGrantLevel, LEVEL_LABELS, levelRank, roleCan, type AccessLevel } from "@/lib/rbac/policy"
import { assertFormAccess, audit, ForbiddenError } from "@/lib/rbac/server"

const id = z.string().min(1).max(64)
const level = z.enum(ACCESS_LEVELS)

function revalidate(formId: string) {
  revalidatePath(`/dashboard/forms/${formId}/access`)
  revalidatePath("/dashboard")
}

const grantSchema = z
  .object({ memberId: id.optional(), groupId: id.optional(), level })
  .refine((v) => !!v.memberId !== !!v.groupId, "Choose one person or one group")

/**
 * Gives a member or group access to a form. Requires Manage on the form, the
 * level can't exceed the caller's own, and the grantee must belong to the
 * form's workspace (no cross-tenant grants).
 */
export async function grantFormAccess(formId: string, input: z.input<typeof grantSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, form, level: mine } = await assertFormAccess(id.parse(formId), "form.access")
    const data = grantSchema.parse(input)
    const decision = canGrantLevel(mine, data.level)
    if (!decision.ok) throw new ForbiddenError(decision.reason)

    let label: string
    if (data.memberId) {
      const member = await prisma.workspaceMember.findFirst({ where: { id: data.memberId, workspaceId: form.workspaceId }, include: { user: { select: { name: true, email: true } } } })
      if (!member) throw new Error("That person isn't a member of this workspace.")
      if (roleCan(member.role, "forms.all")) throw new Error("Owners and admins already manage every form in the workspace.")
      label = member.user.name || member.user.email
    } else {
      const group = await prisma.workspaceGroup.findFirst({ where: { id: data.groupId, workspaceId: form.workspaceId } })
      if (!group) throw new Error("Group not found in this workspace.")
      label = group.name
    }

    const where = data.memberId ? { formId_memberId: { formId: form.id, memberId: data.memberId } } : { formId_groupId: { formId: form.id, groupId: data.groupId! } }
    const existing = await prisma.formAccess.findUnique({ where })
    if (existing && levelRank(existing.level) > levelRank(mine)) throw new ForbiddenError("That grant is above your own access level.")
    const row = existing
      ? await prisma.formAccess.update({ where: { id: existing.id }, data: { level: data.level, grantedById: user.id } })
      : await prisma.formAccess.create({ data: { formId: form.id, memberId: data.memberId ?? null, groupId: data.groupId ?? null, level: data.level, grantedById: user.id } })
    await audit({
      workspaceId: form.workspaceId,
      actorId: user.id,
      action: existing ? "form.access_changed" : "form.access_granted",
      summary: `Gave ${label} ${LEVEL_LABELS[data.level]} access to “${form.title}”`,
      targetType: "form",
      targetId: form.id,
      metadata: { level: data.level, memberId: data.memberId ?? null, groupId: data.groupId ?? null },
    })
    revalidate(form.id)
    return ok({ id: row.id })
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" }
    return fail(e)
  }
}

async function grantOn(formId: string, accessId: string, mine: AccessLevel) {
  const row = await prisma.formAccess.findFirst({
    where: { id: id.parse(accessId), formId },
    include: { member: { include: { user: { select: { name: true, email: true } } } }, group: { select: { name: true } } },
  })
  if (!row) throw new Error("Access entry not found.")
  if (levelRank(row.level) > levelRank(mine)) throw new ForbiddenError("That grant is above your own access level.")
  return { row, label: row.member ? row.member.user.name || row.member.user.email : (row.group?.name ?? "a group") }
}

export async function updateFormAccess(formId: string, accessId: string, next: AccessLevel): Promise<ActionResult<{ level: AccessLevel }>> {
  try {
    const { user, form, level: mine } = await assertFormAccess(id.parse(formId), "form.access")
    const target = level.parse(next)
    const decision = canGrantLevel(mine, target)
    if (!decision.ok) throw new ForbiddenError(decision.reason)
    const { row, label } = await grantOn(form.id, accessId, mine)
    await prisma.formAccess.update({ where: { id: row.id }, data: { level: target, grantedById: user.id } })
    await audit({ workspaceId: form.workspaceId, actorId: user.id, action: "form.access_changed", summary: `Changed ${label} to ${LEVEL_LABELS[target]} on “${form.title}”`, targetType: "form", targetId: form.id, metadata: { from: row.level, to: target } })
    revalidate(form.id)
    return ok({ level: target })
  } catch (e) {
    return fail(e)
  }
}

export async function revokeFormAccess(formId: string, accessId: string): Promise<ActionResult> {
  try {
    const { user, form, level: mine } = await assertFormAccess(id.parse(formId), "form.access")
    const { row, label } = await grantOn(form.id, accessId, mine)
    await prisma.formAccess.delete({ where: { id: row.id } })
    await audit({ workspaceId: form.workspaceId, actorId: user.id, action: "form.access_revoked", summary: `Removed ${label}'s access to “${form.title}”`, targetType: "form", targetId: form.id })
    revalidate(form.id)
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}
