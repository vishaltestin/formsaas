import { cookies } from "next/headers"

import { AppBreadcrumbs } from "@/components/app/app-breadcrumbs"
import { AppSidebar } from "@/components/app/app-sidebar"
import { CommandPalette } from "@/components/app/command-palette"
import { NotificationsBell } from "@/components/app/notifications-bell"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { getInterfaceFont, interfaceFontCss } from "@/lib/appearance"
import { getUserPlanInfo } from "@/lib/entitlements"
import { prisma } from "@/lib/prisma"
import { roleCan } from "@/lib/rbac/policy"
import { accessibleFormsWhere, getWorkspaceContext } from "@/lib/rbac/server"

export async function AppShell({
  user,
  children,
}: {
  user: { id: string; name?: string | null; email?: string | null; role: "USER" | "ADMIN" }
  children: React.ReactNode
}) {
  const [{ active, memberships }, dbUser] = await Promise.all([
    getWorkspaceContext(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { role: true } }),
  ])
  // Platform role is re-read from the DB so a demoted admin loses the admin menu immediately.
  const role = dbUser?.role ?? "USER"
  const [planInfo, forms, pendingRequests, cookieStore, unread, uiFont] = await Promise.all([
    // Usage shown is the active workspace's plan (its owner is the billing owner).
    getUserPlanInfo(active.ownerId),
    prisma.form.findMany({
      where: accessibleFormsWhere(user.id, active),
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, status: true, _count: { select: { submissions: true } } },
      take: 50,
    }),
    role === "ADMIN" ? prisma.upgradeRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
    cookies(),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    getInterfaceFont(),
  ])
  const fontCss = interfaceFontCss(uiFont)

  const shellForms = forms.map((f) => ({
    id: f.id,
    title: f.title,
    status: f.status,
    submissions: f._count.submissions,
  }))
  const formTitles = Object.fromEntries(forms.map((f) => [f.id, f.title]))
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      {fontCss && <style>{fontCss}</style>}
      <AppSidebar
        user={{ name: user.name ?? null, email: user.email ?? "", role }}
        workspace={{
          id: active.workspaceId,
          name: active.workspaceName,
          role: active.role,
          canCreateForms: roleCan(active.role, "form.create"),
          canManageSettings: roleCan(active.role, "email.manage"),
          isOwner: active.ownerId === user.id,
        }}
        workspaces={memberships.map((m) => ({ id: m.workspaceId, name: m.workspaceName, role: m.role }))}
        usage={{
          planName: planInfo.plan.name,
          planSlug: planInfo.plan.slug,
          forms: planInfo.usage.forms,
          maxForms: planInfo.limits.maxForms,
          submissions: planInfo.usage.monthlySubmissions,
          maxSubmissions: planInfo.limits.monthlySubmissions,
        }}
        forms={shellForms}
        pendingRequests={pendingRequests}
      />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <AppBreadcrumbs formTitles={formTitles} />
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette forms={shellForms} isAdmin={role === "ADMIN"} />
            <NotificationsBell initialUnread={unread} />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
