"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { prisma } from "@/lib/prisma"
import { ROLE_LABELS } from "@/lib/rbac/policy"
import { assertWorkspacePermission, audit, ForbiddenError, getMembership, WORKSPACE_COOKIE } from "@/lib/rbac/server"
import { assertUser } from "@/lib/session"

const id = z.string().min(1).max(64)
const nameSchema = z.string().trim().min(2, "Use at least 2 characters").max(80, "Use at most 80 characters")

async function setActiveCookie(workspaceId: string | null) {
  const store = await cookies()
  if (!workspaceId) return void store.delete(WORKSPACE_COOKIE)
  store.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
}

function revalidateAll() {
  revalidatePath("/dashboard", "layout")
}

/** Switches the dashboard to another workspace — only one the caller belongs to. */
export async function switchWorkspace(workspaceId: string): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const user = await assertUser()
    const membership = await getMembership(user.id, id.parse(workspaceId))
    if (!membership) throw new ForbiddenError("You are not a member of that workspace.")
    await setActiveCookie(membership.workspaceId)
    revalidateAll()
    return ok({ id: membership.workspaceId, name: membership.workspaceName })
  } catch (e) {
    return fail(e)
  }
}

export async function createWorkspace(input: { name: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertUser()
    const name = nameSchema.parse(input.name)
    const owned = await prisma.workspace.count({ where: { ownerId: user.id } })
    if (owned >= 10) throw new Error("You can own up to 10 workspaces.")
    const ws = await prisma.workspace.create({
      data: { name, ownerId: user.id, members: { create: { userId: user.id, role: "OWNER" } } },
    })
    await audit({ workspaceId: ws.id, actorId: user.id, action: "workspace.created", summary: `Created workspace “${name}”`, targetType: "workspace", targetId: ws.id })
    await setActiveCookie(ws.id)
    revalidateAll()
    return ok({ id: ws.id })
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid name" }
    return fail(e)
  }
}

export async function renameWorkspace(workspaceId: string, input: { name: string }): Promise<ActionResult<{ name: string }>> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "workspace.rename")
    const name = nameSchema.parse(input.name)
    await prisma.workspace.update({ where: { id: membership.workspaceId }, data: { name } })
    await audit({ workspaceId: membership.workspaceId, actorId: user.id, action: "workspace.renamed", summary: `Renamed workspace from “${membership.workspaceName}” to “${name}”` })
    revalidateAll()
    return ok({ name })
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid name" }
    return fail(e)
  }
}

/** Owner only; the exact workspace name must be typed to confirm. Deletes every form inside. */
export async function deleteWorkspace(workspaceId: string, confirmName: string): Promise<ActionResult> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "workspace.delete")
    if (confirmName.trim() !== membership.workspaceName) throw new Error("Type the workspace name exactly to confirm.")
    const owned = await prisma.workspace.count({ where: { ownerId: user.id } })
    const memberships = await prisma.workspaceMember.count({ where: { userId: user.id } })
    if (memberships <= 1 && owned <= 1) throw new Error("This is your only workspace. Create another one before deleting it.")
    await prisma.workspace.delete({ where: { id: membership.workspaceId } })
    await setActiveCookie(null)
    revalidateAll()
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}

/** Anyone but the owner can leave. Their API keys for the workspace are revoked. */
export async function leaveWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "workspace.view")
    if (membership.role === "OWNER") throw new Error("The owner can't leave. Transfer ownership first, or delete the workspace.")
    await prisma.$transaction([
      prisma.workspaceMember.delete({ where: { id: membership.memberId } }),
      prisma.apiKey.updateMany({ where: { userId: user.id, workspaceId: membership.workspaceId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ])
    await audit({ workspaceId: membership.workspaceId, actorId: user.id, action: "member.left", summary: `${user.name || user.email} left the workspace`, targetType: "member", targetId: membership.memberId })
    await setActiveCookie(null)
    revalidateAll()
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}

/**
 * Hands the workspace to another member. The new owner becomes the billing
 * owner of every form in it; the previous owner stays on as an Admin.
 */
export async function transferOwnership(workspaceId: string, memberId: string): Promise<ActionResult> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "ownership.transfer")
    const target = await prisma.workspaceMember.findFirst({
      where: { id: id.parse(memberId), workspaceId: membership.workspaceId },
      include: { user: { select: { name: true, email: true } } },
    })
    if (!target) throw new Error("Member not found.")
    if (target.userId === user.id) throw new Error("You already own this workspace.")
    await prisma.$transaction([
      prisma.workspace.update({ where: { id: membership.workspaceId }, data: { ownerId: target.userId } }),
      prisma.workspaceMember.update({ where: { id: target.id }, data: { role: "OWNER" } }),
      prisma.workspaceMember.update({ where: { id: membership.memberId }, data: { role: "ADMIN" } }),
      prisma.form.updateMany({ where: { workspaceId: membership.workspaceId }, data: { userId: target.userId } }),
    ])
    await audit({
      workspaceId: membership.workspaceId,
      actorId: user.id,
      action: "workspace.ownership_transferred",
      summary: `Transferred ownership to ${target.user.name || target.user.email}; previous owner is now ${ROLE_LABELS.ADMIN}`,
      targetType: "member",
      targetId: target.id,
    })
    revalidateAll()
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}
