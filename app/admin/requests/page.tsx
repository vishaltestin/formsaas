import type { Metadata } from "next"

import { RequestsQueue, type RequestItem } from "@/components/admin/requests-queue"
import { PageHeader } from "@/components/app/page-header"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/session"

export const metadata: Metadata = { title: "Upgrade requests" }

export default async function AdminRequestsPage() {
  await requireAdmin()
  const now = new Date()
  const requests = await prisma.upgradeRequest.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 300,
    include: {
      requestedPlan: { select: { id: true, name: true, priceLabel: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          _count: { select: { forms: true } },
          subscription: { select: { status: true, expiresAt: true, plan: { select: { name: true, isActive: true } } } },
        },
      },
    },
  })
  const items: RequestItem[] = requests.map((r) => {
    const sub = r.user.subscription
    const active = !!sub && sub.status === "ACTIVE" && (!sub.expiresAt || sub.expiresAt > now) && sub.plan.isActive
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      contactEmail: r.contactEmail,
      contactPhone: r.contactPhone,
      message: r.message,
      adminResponse: r.adminResponse,
      user: { id: r.user.id, name: r.user.name, email: r.user.email, currentPlan: active ? sub!.plan.name : "Free", forms: r.user._count.forms },
      plan: r.requestedPlan,
    }
  })
  // Oldest pending first, so the queue is FIFO.
  items.sort((a, b) => (a.status === "PENDING" && b.status === "PENDING" ? a.createdAt.localeCompare(b.createdAt) : 0))
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-6">
      <PageHeader title="Upgrade requests" description="Approve to activate the plan instantly, or decline with a note. Each request can only be resolved once." />
      <RequestsQueue requests={items} />
    </div>
  )
}
