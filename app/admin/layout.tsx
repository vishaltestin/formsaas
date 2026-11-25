import { ShieldCheckIcon } from "lucide-react"

import { AdminNav } from "@/components/admin/admin-nav"
import { AppShell } from "@/components/app/app-shell"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/session"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()
  const pending = await prisma.upgradeRequest.count({ where: { status: "PENDING" } })
  return (
    <AppShell user={{ ...user, role: "ADMIN" }}>
      <div className="border-b bg-sidebar/60">
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-6">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5 text-primary" />
            <span className="font-medium tracking-wide text-foreground uppercase">Admin console</span>
            <span aria-hidden>·</span>
            <span>Digital Fueled workspace</span>
          </div>
          <AdminNav pending={pending} />
        </div>
      </div>
      {children}
    </AppShell>
  )
}
