import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { BillingView } from "@/components/billing/billing-view"
import { getOwnerContact, getUserPlanInfo } from "@/lib/entitlements"
import { normalizeFeatures, normalizeLimits } from "@/lib/plans"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"

export const metadata: Metadata = { title: "Plan & billing" }

export default async function BillingPage() {
  const user = await requireUser()
  const [info, plans, requests, owner] = await Promise.all([
    getUserPlanInfo(user.id),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.upgradeRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { requestedPlan: { select: { name: true } } },
    }),
    getOwnerContact(),
  ])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <PageHeader title="Plan & billing" description="Your plan, usage and upgrade options." />
      <BillingView
        userEmail={user.email ?? ""}
        current={{
          planId: info.plan.id,
          planSlug: info.plan.slug,
          planName: info.plan.name,
          priceLabel: info.plan.priceLabel,
          status: info.subscription.status,
          expiresAt: info.subscription.expiresAt?.toISOString() ?? null,
          usage: info.usage,
          limits: info.limits,
        }}
        plans={plans.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          description: p.description,
          priceLabel: p.priceLabel,
          limits: normalizeLimits(p.limits),
          features: normalizeFeatures(p.features),
        }))}
        requests={requests.map((r) => ({
          id: r.id,
          planName: r.requestedPlan.name,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          adminResponse: r.adminResponse,
          message: r.message,
        }))}
        owner={owner}
      />
    </div>
  )
}
