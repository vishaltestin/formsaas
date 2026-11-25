import type { Metadata } from "next"

import { SettingsEditor } from "@/components/admin/settings-editor"
import { PageHeader } from "@/components/app/page-header"
import { getOwnerContact } from "@/lib/entitlements"
import { normalizeFeatures, normalizeLimits } from "@/lib/plans"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/session"

export const metadata: Metadata = { title: "Plans & contact" }

export default async function AdminSettingsPage() {
  await requireAdmin()
  const now = new Date()
  const [plans, contact] = await Promise.all([
    prisma.plan.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: {
          select: { subscriptions: { where: { status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
        },
      },
    }),
    getOwnerContact(),
  ])
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <PageHeader title="Plans & contact" description="Edit pricing tiers and the contact details users see when upgrading." />
      <SettingsEditor
        contact={contact}
        plans={plans.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          description: p.description ?? "",
          priceLabel: p.priceLabel,
          isActive: p.isActive,
          limits: normalizeLimits(p.limits),
          features: normalizeFeatures(p.features),
          subscribers: p._count.subscriptions,
        }))}
      />
    </div>
  )
}
