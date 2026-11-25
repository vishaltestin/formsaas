import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { SettingsNav } from "@/components/team/settings-nav"
import { WorkspaceGeneral } from "@/components/team/workspace-general"
import { prisma } from "@/lib/prisma"
import { roleCan, ROLE_LABELS } from "@/lib/rbac/policy"
import { requireWorkspace } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Workspace settings" }

export default async function WorkspaceSettingsPage() {
  const { membership, memberships } = await requireWorkspace("workspace.view")
  const [owner, forms, members] = await Promise.all([
    prisma.user.findUnique({ where: { id: membership.ownerId }, select: { name: true, email: true } }),
    prisma.form.count({ where: { workspaceId: membership.workspaceId } }),
    prisma.workspaceMember.count({ where: { workspaceId: membership.workspaceId } }),
  ])
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <PageHeader title="Workspace settings" description={`Settings for ${membership.workspaceName}.`} />
      <SettingsNav active="general" role={membership.role} />
      <WorkspaceGeneral
        workspaceId={membership.workspaceId}
        name={membership.workspaceName}
        roleLabel={ROLE_LABELS[membership.role]}
        owner={owner ? owner.name || owner.email : "—"}
        forms={forms}
        members={members}
        can={{
          rename: roleCan(membership.role, "workspace.rename"),
          remove: roleCan(membership.role, "workspace.delete"),
          leave: membership.role !== "OWNER",
          create: true,
        }}
        onlyWorkspace={memberships.length <= 1}
      />
    </div>
  )
}
