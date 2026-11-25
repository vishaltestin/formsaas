import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import {
  ensurePersonalWorkspace,
  ForbiddenError,
  getMembership,
  listMemberships,
  NO_FORM_ACCESS,
  resolveFormAccess,
  type FormAccessResult,
} from "@/lib/rbac/core"
import { landingSegment, levelAllows, roleCan, type FormPermission, type WorkspacePermission } from "@/lib/rbac/policy"
import { assertUser, requireUser } from "@/lib/session"

export * from "@/lib/rbac/core"

/**
 * Session-aware RBAC guards for pages and server actions. The JWT only
 * identifies the user; roles and grants come from lib/rbac/core.ts (live DB).
 */

export const WORKSPACE_COOKIE = "df_ws"
type SessionUser = Awaited<ReturnType<typeof assertUser>>

/**
 * The workspace the dashboard is showing. The `df_ws` cookie only expresses a
 * preference — it is honoured solely when the user is still a member.
 */
export const getWorkspaceContext = cache(async (userId: string) => {
  const [memberships, cookieStore] = await Promise.all([listMemberships(userId), cookies()])
  let all = memberships
  if (all.length === 0) all = [await ensurePersonalWorkspace(userId)]
  const preferred = cookieStore.get(WORKSPACE_COOKIE)?.value
  const active = all.find((m) => m.workspaceId === preferred) ?? all.find((m) => m.role === "OWNER") ?? all[0]
  return { active, memberships: all }
})

/** Pages: the active workspace, optionally requiring a capability (else back to /dashboard). */
export async function requireWorkspace(permission?: WorkspacePermission) {
  const user = await requireUser()
  const { active, memberships } = await getWorkspaceContext(user.id)
  if (permission && !roleCan(active.role, permission)) redirect("/dashboard")
  return { user, membership: active, memberships }
}

/**
 * Actions: verify the caller is a member of `workspaceId` (sent by the page they
 * are on) with the capability. Throws ForbiddenError otherwise.
 */
export async function assertWorkspacePermission(workspaceId: string, permission: WorkspacePermission) {
  const user = await assertUser()
  const membership = await getMembership(user.id, workspaceId)
  if (!membership) throw new ForbiddenError("You are not a member of this workspace.")
  if (!roleCan(membership.role, permission)) throw new ForbiddenError()
  return { user, membership }
}

// ─── Forms ──────────────────────────────────────────────────────────────────

/** Pages: require a form permission. No access → /dashboard; some access → the caller's landing tab. */
export async function requireFormAccess(formId: string, permission: FormPermission) {
  const user = await requireUser()
  const access = await resolveFormAccess(user.id, formId)
  if (!access) redirect("/dashboard")
  if (!levelAllows(access.level, permission)) redirect(`/dashboard/forms/${formId}/${landingSegment(access.level)}`)
  return { user, ...access }
}

/** Actions: require a form permission or throw (same message for "missing" and "forbidden"). */
export async function assertFormAccess(formId: string, permission: FormPermission): Promise<{ user: SessionUser } & FormAccessResult> {
  const user = await assertUser()
  const access = await resolveFormAccess(user.id, formId)
  if (!access) throw new ForbiddenError(NO_FORM_ACCESS)
  if (!levelAllows(access.level, permission)) throw new ForbiddenError(`Your ${access.level.toLowerCase()} access to this form doesn't allow that.`)
  return { user, ...access }
}

