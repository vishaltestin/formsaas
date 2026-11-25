/**
 * RBAC policy — pure functions with no I/O so every rule is unit tested and
 * shared by server actions, pages, the REST API and (for display only) the UI.
 *
 * Two layers:
 *  1. Workspace role  OWNER > ADMIN > EDITOR > MEMBER  → workspace capabilities
 *  2. Form level      MANAGE > EDIT > REVIEW > VIEW    → what can be done to one form
 *
 * Effective form level =
 *    OWNER / ADMIN                         → MANAGE on every form in the workspace
 *    EDITOR who created the form           → MANAGE
 *    otherwise the highest explicit grant  → direct member grant or any group grant
 *    no grant                              → no access (the form is invisible)
 *
 * Roles are always re-read from the database (lib/rbac/server.ts); nothing here
 * trusts the session token. Platform admins (User.role ADMIN) manage plans and
 * users only — they get no implicit access to tenant forms or responses.
 */

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "EDITOR", "MEMBER"] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

export const ACCESS_LEVELS = ["VIEW", "REVIEW", "EDIT", "MANAGE"] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]

const ROLE_RANK: Record<WorkspaceRole, number> = { MEMBER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 }
const LEVEL_RANK: Record<AccessLevel, number> = { VIEW: 0, REVIEW: 1, EDIT: 2, MANAGE: 3 }

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  EDITOR: "Editor",
  MEMBER: "Member",
}

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  OWNER: "Full control, billing owner of every form. One per workspace.",
  ADMIN: "Manages people, groups, email delivery and every form.",
  EDITOR: "Creates forms and manages the forms they created or were given.",
  MEMBER: "Only sees the forms assigned to them or their groups.",
}

export const LEVEL_LABELS: Record<AccessLevel, string> = {
  VIEW: "View",
  REVIEW: "Review",
  EDIT: "Edit",
  MANAGE: "Manage",
}

export const LEVEL_DESCRIPTIONS: Record<AccessLevel, string> = {
  VIEW: "Read responses and analytics, export data.",
  REVIEW: "View, plus triage responses: status, tags and notes.",
  EDIT: "Review, plus build, publish, share, automations and webhooks.",
  MANAGE: "Edit, plus delete the form and control who has access.",
}

export const isWorkspaceRole = (v: unknown): v is WorkspaceRole => typeof v === "string" && (WORKSPACE_ROLES as readonly string[]).includes(v)
export const isAccessLevel = (v: unknown): v is AccessLevel => typeof v === "string" && (ACCESS_LEVELS as readonly string[]).includes(v)

export const roleRank = (r: WorkspaceRole) => ROLE_RANK[r]
export const levelRank = (l: AccessLevel) => LEVEL_RANK[l]

export function maxLevel(levels: readonly (AccessLevel | null | undefined)[]): AccessLevel | null {
  let best: AccessLevel | null = null
  for (const l of levels) if (isAccessLevel(l) && (best === null || LEVEL_RANK[l] > LEVEL_RANK[best])) best = l
  return best
}

// ─── Workspace capabilities ─────────────────────────────────────────────────

export type WorkspacePermission =
  | "workspace.view"
  | "members.view"
  | "form.create"
  | "templates.manage"
  | "forms.all"
  | "members.invite"
  | "members.manage"
  | "groups.manage"
  | "email.manage"
  | "audit.view"
  | "workspace.rename"
  | "workspace.delete"
  | "ownership.transfer"

const MIN_ROLE: Record<WorkspacePermission, WorkspaceRole> = {
  "workspace.view": "MEMBER",
  "members.view": "MEMBER",
  "form.create": "EDITOR",
  "templates.manage": "EDITOR",
  "forms.all": "ADMIN",
  "members.invite": "ADMIN",
  "members.manage": "ADMIN",
  "groups.manage": "ADMIN",
  "email.manage": "ADMIN",
  "audit.view": "ADMIN",
  "workspace.rename": "ADMIN",
  "workspace.delete": "OWNER",
  "ownership.transfer": "OWNER",
}

export function roleCan(role: WorkspaceRole | null | undefined, permission: WorkspacePermission): boolean {
  if (!role || !isWorkspaceRole(role)) return false
  return ROLE_RANK[role] >= ROLE_RANK[MIN_ROLE[permission]]
}

// ─── Form permissions ───────────────────────────────────────────────────────

export type FormPermission =
  | "form.view"
  | "submissions.export"
  | "submissions.review"
  | "submissions.delete"
  | "form.edit"
  | "form.publish"
  | "form.share"
  | "automations.manage"
  | "automations.approve"
  | "webhooks.manage"
  | "form.duplicate"
  | "form.delete"
  | "form.access"

const PERMISSION_LEVEL: Record<FormPermission, AccessLevel> = {
  "form.view": "VIEW",
  "submissions.export": "VIEW",
  "submissions.review": "REVIEW",
  "automations.approve": "REVIEW",
  "submissions.delete": "EDIT",
  "form.edit": "EDIT",
  "form.publish": "EDIT",
  "form.share": "EDIT",
  "automations.manage": "EDIT",
  "webhooks.manage": "EDIT",
  "form.duplicate": "EDIT",
  "form.delete": "MANAGE",
  "form.access": "MANAGE",
}

export const requiredLevel = (p: FormPermission) => PERMISSION_LEVEL[p]

export function levelAllows(level: AccessLevel | null | undefined, permission: FormPermission): boolean {
  if (!level || !isAccessLevel(level)) return false
  return LEVEL_RANK[level] >= LEVEL_RANK[PERMISSION_LEVEL[permission]]
}

export interface FormAccessInput {
  /** The caller's role in the form's workspace (null = not a member). */
  role: WorkspaceRole | null
  /** Caller created the form. */
  isCreator: boolean
  /** Levels granted directly to the caller's membership. */
  direct: readonly AccessLevel[]
  /** Levels granted to groups the caller belongs to. */
  groups: readonly AccessLevel[]
}

export function effectiveFormLevel(input: FormAccessInput): AccessLevel | null {
  // Grants only count while the caller is a member of the form's workspace.
  if (!input.role || !isWorkspaceRole(input.role)) return null
  if (roleCan(input.role, "forms.all")) return "MANAGE"
  const implicit: AccessLevel | null = input.role === "EDITOR" && input.isCreator ? "MANAGE" : null
  return maxLevel([implicit, ...input.direct, ...input.groups])
}

/** Every form permission granted by a level — sent to the client for UI gating only. */
export function permissionsFor(level: AccessLevel | null): Record<FormPermission, boolean> {
  const out = {} as Record<FormPermission, boolean>
  for (const p of Object.keys(PERMISSION_LEVEL) as FormPermission[]) out[p] = levelAllows(level, p)
  return out
}

// ─── Escalation guards ──────────────────────────────────────────────────────

export type Decision = { ok: true } | { ok: false; reason: string }
const allow: Decision = { ok: true }
const deny = (reason: string): Decision => ({ ok: false, reason })

/**
 * May `actor` change or remove the membership of someone currently holding
 * `target`? Nobody touches the OWNER (ownership is transferred instead), and an
 * ADMIN can only act on people strictly below them.
 */
export function canManageMember(actor: WorkspaceRole, target: WorkspaceRole, opts: { self?: boolean } = {}): Decision {
  if (!roleCan(actor, "members.manage")) return deny("Only owners and admins can manage members.")
  if (target === "OWNER") return deny("The owner can't be changed or removed. Transfer ownership first.")
  if (opts.self) return deny("You can't change your own role. Ask another admin or the owner.")
  if (actor === "OWNER") return allow
  if (ROLE_RANK[target] >= ROLE_RANK[actor]) return deny("Admins can only manage editors and members.")
  return allow
}

/** May `actor` hand out `role` (on invite or role change)? Never above or equal to their own, except the owner granting ADMIN. */
export function canGrantRole(actor: WorkspaceRole, role: WorkspaceRole): Decision {
  if (!roleCan(actor, "members.invite")) return deny("Only owners and admins can add people.")
  if (role === "OWNER") return deny("There is one owner per workspace. Use “Transfer ownership”.")
  if (actor === "OWNER") return allow
  if (ROLE_RANK[role] >= ROLE_RANK[actor]) return deny("Admins can only grant the Editor or Member role.")
  return allow
}

/** May someone whose effective level is `actorLevel` grant `level` on a form? Never above their own. */
export function canGrantLevel(actorLevel: AccessLevel | null, level: AccessLevel): Decision {
  if (!levelAllows(actorLevel, "form.access")) return deny("You need Manage access to share this form with people.")
  if (LEVEL_RANK[level] > LEVEL_RANK[actorLevel!]) return deny("You can't grant more access than you have.")
  return allow
}

/** Which tab a caller lands on for a form, given their level. */
export function landingSegment(level: AccessLevel): "edit" | "submissions" {
  return levelAllows(level, "form.edit") ? "edit" : "submissions"
}

/** Form dashboard sections and the permission each one needs. */
export const FORM_SECTIONS = {
  edit: "form.edit",
  logic: "form.edit",
  share: "form.share",
  submissions: "form.view",
  analytics: "form.view",
  automations: "automations.manage",
  integrations: "webhooks.manage",
  access: "form.access",
} as const satisfies Record<string, FormPermission>
export type FormSection = keyof typeof FORM_SECTIONS
