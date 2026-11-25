import "server-only"

import type { Form, Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { effectiveFormLevel, roleCan, type AccessLevel, type WorkspaceRole } from "@/lib/rbac/policy"

/**
 * Database side of RBAC (no session / cookies, so the REST API and tests can
 * use it). Every call re-reads membership, role and grants — nothing is cached
 * or taken from a token. Failures use one generic message so callers can't
 * probe which ids exist in other workspaces.
 */

export const NO_FORM_ACCESS = "Form not found or you don't have access to it."

export class ForbiddenError extends Error {
  readonly status = 403
  constructor(message = "You don't have permission to do that.") {
    super(message)
    this.name = "ForbiddenError"
  }
}

export interface Membership {
  memberId: string
  workspaceId: string
  workspaceName: string
  ownerId: string
  role: WorkspaceRole
}

function toMembership(m: { id: string; role: WorkspaceRole; workspace: { id: string; name: string; ownerId: string } }): Membership {
  return { memberId: m.id, workspaceId: m.workspace.id, workspaceName: m.workspace.name, ownerId: m.workspace.ownerId, role: m.role }
}

export async function getMembership(userId: string, workspaceId: string): Promise<Membership | null> {
  if (!workspaceId || workspaceId.length > 64) return null
  const m = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true, role: true, workspace: { select: { id: true, name: true, ownerId: true } } },
  })
  return m ? toMembership(m) : null
}

export async function listMemberships(userId: string): Promise<Membership[]> {
  const rows = await prisma.workspaceMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, workspace: { select: { id: true, name: true, ownerId: true } } },
  })
  return rows.map(toMembership)
}

/** Every account always has at least one workspace; a personal one is created on first use. */
export async function ensurePersonalWorkspace(userId: string): Promise<Membership> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } })
  const base = user.name?.trim() || user.email.split("@")[0]
  const ws = await prisma.workspace.create({
    data: {
      name: `${base}'s workspace`.slice(0, 80),
      ownerId: userId,
      members: { create: { userId, role: "OWNER" } },
    },
    select: { id: true },
  })
  const m = await getMembership(userId, ws.id)
  return m!
}

export interface FormAccessResult {
  form: Form
  level: AccessLevel
  membership: Membership
}

/** Computes the caller's effective level on a form from live DB state, or null. */
export async function resolveFormAccess(userId: string, formId: string): Promise<FormAccessResult | null> {
  if (typeof formId !== "string" || !formId || formId.length > 64) return null
  const form = await prisma.form.findUnique({ where: { id: formId } })
  if (!form) return null
  const membership = await getMembership(userId, form.workspaceId)
  if (!membership) return null
  let direct: AccessLevel[] = []
  let groups: AccessLevel[] = []
  if (!roleCan(membership.role, "forms.all")) {
    const grants = await prisma.formAccess.findMany({
      where: {
        formId,
        OR: [{ memberId: membership.memberId }, { group: { workspaceId: form.workspaceId, members: { some: { memberId: membership.memberId } } } }],
      },
      select: { memberId: true, level: true },
    })
    direct = grants.filter((g) => g.memberId === membership.memberId).map((g) => g.level)
    groups = grants.filter((g) => g.memberId !== membership.memberId).map((g) => g.level)
  }
  const level = effectiveFormLevel({ role: membership.role, isCreator: form.createdById === userId, direct, groups })
  return level ? { form, level, membership } : null
}

/** Prisma filter for the forms a member can see in a workspace (mirrors effectiveFormLevel). */
export function accessibleFormsWhere(userId: string, membership: Pick<Membership, "workspaceId" | "memberId" | "role">): Prisma.FormWhereInput {
  if (roleCan(membership.role, "forms.all")) return { workspaceId: membership.workspaceId }
  return {
    workspaceId: membership.workspaceId,
    OR: [
      ...(membership.role === "EDITOR" ? [{ createdById: userId }] : []),
      { access: { some: { memberId: membership.memberId } } },
      { access: { some: { group: { workspaceId: membership.workspaceId, members: { some: { memberId: membership.memberId } } } } } },
    ],
  }
}

/** Effective level for many forms at once (dashboard lists). */
export async function formLevels(
  userId: string,
  membership: Pick<Membership, "workspaceId" | "memberId" | "role">,
  forms: { id: string; createdById: string | null }[]
): Promise<Map<string, AccessLevel>> {
  const out = new Map<string, AccessLevel>()
  if (forms.length === 0) return out
  const grants = roleCan(membership.role, "forms.all")
    ? []
    : await prisma.formAccess.findMany({
        where: {
          formId: { in: forms.map((f) => f.id) },
          OR: [{ memberId: membership.memberId }, { group: { workspaceId: membership.workspaceId, members: { some: { memberId: membership.memberId } } } }],
        },
        select: { formId: true, memberId: true, level: true },
      })
  for (const f of forms) {
    const mine = grants.filter((g) => g.formId === f.id)
    const level = effectiveFormLevel({
      role: membership.role,
      isCreator: f.createdById === userId,
      direct: mine.filter((g) => g.memberId === membership.memberId).map((g) => g.level),
      groups: mine.filter((g) => g.memberId !== membership.memberId).map((g) => g.level),
    })
    if (level) out.set(f.id, level)
  }
  return out
}

// ─── Audit ──────────────────────────────────────────────────────────────────

export async function audit(entry: {
  workspaceId: string
  actorId: string | null
  action: string
  summary: string
  targetType?: string
  targetId?: string
  metadata?: Prisma.InputJsonValue
}) {
  await prisma.auditLog
    .create({
      data: {
        workspaceId: entry.workspaceId,
        actorId: entry.actorId,
        action: entry.action.slice(0, 64),
        summary: entry.summary.slice(0, 500),
        targetType: entry.targetType?.slice(0, 32),
        targetId: entry.targetId?.slice(0, 64),
        metadata: entry.metadata,
      },
    })
    .catch(() => undefined)
}
