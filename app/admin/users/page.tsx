import type { Metadata } from "next"

import { UsersTable, type AdminUserRow } from "@/components/admin/users-table"
import { PageHeader } from "@/components/app/page-header"
import { startOfMonth } from "@/lib/entitlements"
import { normalizeLimits } from "@/lib/plans"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/session"

export const metadata: Metadata = { title: "Users & plans" }

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { q } = await searchParams
  const admin = await requireAdmin()
  const now = new Date()
  const [users, plans, monthly] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { forms: true } },
        subscription: { include: { plan: true, assignedBy: { select: { email: true } } } },
      },
    }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.submission.findMany({
      where: { createdAt: { gte: startOfMonth() } },
      select: { form: { select: { userId: true } } },
    }),
  ])
  const subsByUser = new Map<string, number>()
  for (const s of monthly) subsByUser.set(s.form.userId, (subsByUser.get(s.form.userId) ?? 0) + 1)
  const free = plans.find((p) => p.slug === "free")

  const rows: AdminUserRow[] = users.map((u) => {
    const sub = u.subscription
    const effective = !!sub && sub.status === "ACTIVE" && (!sub.expiresAt || sub.expiresAt > now) && sub.plan.isActive
    const plan = effective ? sub!.plan : free
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      forms: u._count.forms,
      monthlySubmissions: subsByUser.get(u.id) ?? 0,
      sub: sub
        ? {
            planId: sub.planId,
            planName: sub.plan.name,
            status: sub.status,
            expiresAt: sub.expiresAt?.toISOString() ?? null,
            adminNotes: sub.adminNotes,
            assignedBy: sub.assignedBy?.email ?? null,
            effective,
          }
        : null,
      effectivePlanName: plan?.name ?? "Free",
      limits: normalizeLimits(plan?.limits),
    }
  })
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <PageHeader title="Users & plans" description="Assign plans, set expiry dates and manage admin access." />
      <UsersTable
        users={rows}
        selfId={admin.id}
        initialQuery={typeof q === "string" ? q.slice(0, 200) : ""}
        plans={plans.map((p) => ({ id: p.id, name: p.name, slug: p.slug, priceLabel: p.priceLabel }))}
      />
    </div>
  )
}
