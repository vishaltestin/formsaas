import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { FormAccessPanel, type AccessCandidate, type AccessGrant, type AutomaticAccess } from "@/components/team/form-access-panel"
import { prisma } from "@/lib/prisma"
import { ROLE_LABELS, roleCan } from "@/lib/rbac/policy"
import { requireFormAccess } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "People & access" }

export default async function FormAccessPage(props: PageProps<"/dashboard/forms/[formId]/access">) {
  const { formId } = await props.params
  const { form, level } = await requireFormAccess(formId, "form.access")

  const [grants, members, groups] = await Promise.all([
    prisma.formAccess.findMany({
      where: { formId: form.id },
      orderBy: { createdAt: "asc" },
      include: {
        member: { select: { id: true, role: true, user: { select: { name: true, email: true } } } },
        group: { select: { id: true, name: true, _count: { select: { members: true } } } },
      },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: form.workspaceId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, userId: true, user: { select: { name: true, email: true } } },
    }),
    prisma.workspaceGroup.findMany({
      where: { workspaceId: form.workspaceId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { members: true } } },
    }),
  ])

  const plural = (n: number) => `${n} member${n === 1 ? "" : "s"}`
  const grantRows: AccessGrant[] = grants.flatMap((g): AccessGrant[] => {
    if (g.member) return [{ id: `${g.id}:${g.member.id}`, kind: "member", name: g.member.user.name || g.member.user.email, detail: `${g.member.user.email} · ${ROLE_LABELS[g.member.role]}`, level: g.level }]
    if (g.group) return [{ id: `${g.id}:${g.group.id}`, kind: "group", name: g.group.name, detail: plural(g.group._count.members), level: g.level }]
    return []
  })

  const candidates: AccessCandidate[] = [
    ...groups.map((g) => ({ id: g.id, kind: "group" as const, name: g.name, detail: plural(g._count.members) })),
    ...members
      .filter((m) => !roleCan(m.role, "forms.all"))
      .map((m) => ({ id: m.id, kind: "member" as const, name: m.user.name || m.user.email, detail: ROLE_LABELS[m.role] })),
  ]

  const automatic: AutomaticAccess[] = members.flatMap((m): AutomaticAccess[] => {
    if (m.role === "OWNER") return [{ name: m.user.name ?? "", email: m.user.email, role: m.role, reason: "Workspace owner — every form" }]
    if (m.role === "ADMIN") return [{ name: m.user.name ?? "", email: m.user.email, role: m.role, reason: "Workspace admin — every form" }]
    if (m.role === "EDITOR" && m.userId === form.createdById) return [{ name: m.user.name ?? "", email: m.user.email, role: m.role, reason: "Created this form" }]
    return []
  })

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <PageHeader title="People & access" description="Decide who on your team can see, review or change this form and its responses." />
      <FormAccessPanel formId={form.id} myLevel={level} grants={grantRows} candidates={candidates} automatic={automatic} />
    </div>
  )
}
