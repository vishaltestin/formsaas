import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { TeamView, type TeamAudit, type TeamGroup, type TeamInvite, type TeamMember } from "@/components/team/team-view"
import { formatDate, formatDateTime } from "@/lib/format"
import { prisma } from "@/lib/prisma"
import { roleCan, ROLE_LABELS } from "@/lib/rbac/policy"
import { requireWorkspace } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Team" }

const TABS = new Set(["members", "groups", "invites", "activity"])

export default async function TeamPage(props: PageProps<"/dashboard/team">) {
  const { user, membership } = await requireWorkspace("members.view")
  const sp = await props.searchParams
  const ws = membership.workspaceId
  const can = {
    invite: roleCan(membership.role, "members.invite"),
    manage: roleCan(membership.role, "members.manage"),
    groups: roleCan(membership.role, "groups.manage"),
    audit: roleCan(membership.role, "audit.view"),
    transfer: roleCan(membership.role, "ownership.transfer"),
  }

  const [members, groups, invites, logs] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: ws },
      orderBy: [{ createdAt: "asc" }],
      include: {
        user: { select: { name: true, email: true } },
        groups: { select: { groupId: true } },
        _count: { select: { access: true } },
      },
    }),
    prisma.workspaceGroup.findMany({
      where: { workspaceId: ws },
      orderBy: { name: "asc" },
      include: {
        members: { select: { memberId: true } },
        access: { select: { formId: true, level: true, form: { select: { title: true } } } },
      },
    }),
    can.invite
      ? prisma.workspaceInvite.findMany({
          where: { workspaceId: ws, acceptedAt: null, revokedAt: null },
          orderBy: { createdAt: "desc" },
          include: { invitedBy: { select: { name: true, email: true } } },
        })
      : Promise.resolve([]),
    can.audit
      ? prisma.auditLog.findMany({ where: { workspaceId: ws }, orderBy: { createdAt: "desc" }, take: 100, include: { actor: { select: { name: true, email: true } } } })
      : Promise.resolve([]),
  ])

  const order = { OWNER: 0, ADMIN: 1, EDITOR: 2, MEMBER: 3 } as const
  const memberRows: TeamMember[] = members
    .map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      groupIds: m.groups.map((g) => g.groupId),
      grants: m._count.access,
      joined: formatDate(m.createdAt),
    }))
    .sort((a, b) => order[a.role] - order[b.role])

  const groupRows: TeamGroup[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    memberIds: g.members.map((m) => m.memberId),
    forms: g.access.map((a) => ({ formId: a.formId, title: a.form.title, level: a.level })),
  }))

  const now = new Date()
  const inviteRows: TeamInvite[] = invites.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    invitedBy: i.invitedBy ? i.invitedBy.name || i.invitedBy.email : null,
    expires: formatDate(i.expiresAt),
    expired: i.expiresAt < now,
  }))

  const auditRows: TeamAudit[] = logs.map((l) => ({
    id: l.id,
    when: formatDateTime(l.createdAt),
    actor: l.actor ? l.actor.name || l.actor.email : null,
    action: l.action,
    summary: l.summary,
  }))

  const requested = typeof sp.tab === "string" && TABS.has(sp.tab) ? sp.tab : "members"
  const initialTab = (requested === "invites" && !can.invite) || (requested === "activity" && !can.audit) ? "members" : requested

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <PageHeader
        title="Team"
        description={
          <>
            People in <span className="font-medium text-foreground">{membership.workspaceName}</span> · you&rsquo;re {/^[AEIOU]/.test(ROLE_LABELS[membership.role]) ? "an" : "a"}{" "}
            {ROLE_LABELS[membership.role]}. Owners and admins see every form; everyone else sees only forms assigned to them or their groups.
          </>
        }
      />
      <TeamView
        workspaceId={ws}
        workspaceName={membership.workspaceName}
        me={{ userId: user.id, role: membership.role }}
        can={can}
        members={memberRows}
        groups={groupRows}
        invites={inviteRows}
        audit={auditRows}
        initialTab={initialTab}
      />
    </div>
  )
}
