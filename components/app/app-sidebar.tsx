"use client"

import { useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BuildingIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  MailIcon,
  PlusIcon,
  UserCogIcon,
  CodeIcon,
  CreditCardIcon,
  FileTextIcon,
  InboxIcon,
  LayoutGridIcon,
  LayoutTemplateIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
  UsersIcon, GaugeIcon, PaletteIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { toast } from "sonner"

import { signOutAction } from "@/app/actions/auth"
import { switchWorkspace } from "@/app/actions/workspaces"
import { LogoMark } from "@/components/app/logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { initials } from "@/lib/format"
import { formatLimit } from "@/lib/plans"
import { ROLE_LABELS, type WorkspaceRole } from "@/lib/rbac/policy"

export interface ShellWorkspace {
  id: string
  name: string
  role: WorkspaceRole
  canCreateForms: boolean
  canManageSettings: boolean
  isOwner: boolean
}

export interface ShellWorkspaceOption {
  id: string
  name: string
  role: WorkspaceRole
}

export interface ShellForm {
  id: string
  title: string
  status: string
  submissions: number
}

export interface ShellUsage {
  planName: string
  planSlug: string
  forms: number
  maxForms: number
  submissions: number
  maxSubmissions: number
}

export interface ShellUser {
  name: string | null
  email: string
  role: "USER" | "ADMIN"
}

function pct(used: number, max: number) {
  if (max < 0) return 4
  if (max === 0) return 100
  return Math.min(100, Math.round((used / max) * 100))
}

export function AppSidebar({
  user,
  workspace,
  workspaces,
  usage,
  forms,
  pendingRequests,
}: {
  user: ShellUser
  workspace: ShellWorkspace
  workspaces: ShellWorkspaceOption[]
  usage: ShellUsage
  forms: ShellForm[]
  pendingRequests: number
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { setTheme, theme } = useTheme()
  const { state, isMobile } = useSidebar()
  const [switching, startSwitch] = useTransition()

  const main = [
    { href: "/dashboard", label: "Forms", icon: LayoutGridIcon, exact: true, show: true },
    { href: "/dashboard/templates", label: "Templates", icon: LayoutTemplateIcon, show: workspace.canCreateForms },
    { href: "/dashboard/team", label: "Team", icon: UserCogIcon, show: true },
    { href: "/dashboard/settings/email", label: "Email delivery", icon: MailIcon, show: workspace.canManageSettings },
    { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon, exact: true, show: true },
    { href: "/dashboard/developers", label: "Developers", icon: CodeIcon, show: true },
    { href: "/dashboard/billing", label: "Plan & billing", icon: CreditCardIcon, show: true },
  ].filter((i) => i.show)

  const onSwitch = (id: string) => {
    if (id === workspace.id) return
    startSwitch(async () => {
      const res = await switchWorkspace(id)
      if (!res.ok) return void toast.error(res.error)
      toast.success(`Switched to ${res.data.name}`)
      router.push("/dashboard")
      router.refresh()
    })
  }
  const admin = [
    { href: "/admin", label: "Overview", icon: GaugeIcon, exact: true },
    { href: "/admin/users", label: "Users & plans", icon: UsersIcon },
    { href: "/admin/requests", label: "Upgrade requests", icon: InboxIcon, badge: pendingRequests },
    { href: "/admin/settings", label: "Plans & contact", icon: SettingsIcon },
    { href: "/admin/appearance", label: "Appearance", icon: PaletteIcon },
  ]
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  const formsPct = pct(usage.forms, usage.maxForms)
  const subsPct = pct(usage.submissions, usage.maxSubmissions)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={workspace.name} className="data-[state=open]:bg-sidebar-accent" disabled={switching} data-testid="workspace-switcher">
                  <LogoMark className="size-8" />
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-semibold">{workspace.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {ROLE_LABELS[workspace.role]} · {usage.planName}
                    </span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side={isMobile ? "bottom" : "right"} className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
                {workspaces.map((w) => (
                  <DropdownMenuItem key={w.id} onSelect={() => onSwitch(w.id)} className="gap-2">
                    <BuildingIcon />
                    <span className="min-w-0 flex-1 truncate">{w.name}</span>
                    <span className="text-[11px] text-muted-foreground">{ROLE_LABELS[w.role]}</span>
                    {w.id === workspace.id && <CheckIcon className="size-4" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <PlusIcon /> New workspace
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href, item.exact)} tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {forms.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Recent forms</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {forms.slice(0, 6).map((f) => (
                  <SidebarMenuItem key={f.id}>
                    <SidebarMenuButton asChild isActive={pathname.startsWith(`/dashboard/forms/${f.id}`)} tooltip={f.title}>
                      <Link href={`/dashboard/forms/${f.id}/edit`}>
                        <FileTextIcon />
                        <span>{f.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {f.submissions > 0 && <SidebarMenuBadge>{f.submissions}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {user.role === "ADMIN" && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {admin.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.href, item.exact)} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {!!item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        {state === "expanded" && (
          <div className="flex flex-col gap-3 rounded-lg border bg-background p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Usage</span>
              <Badge variant="outline" className="h-5 text-[10px]">
                {usage.planName}
              </Badge>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Forms</span>
                <span className="font-mono">
                  {usage.forms} / {formatLimit(usage.maxForms)}
                </span>
              </div>
              <Progress value={formsPct} className={formsPct >= 90 ? "[&>div]:bg-destructive" : ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Responses this month</span>
                <span className="font-mono">
                  {usage.submissions.toLocaleString()} / {formatLimit(usage.maxSubmissions)}
                </span>
              </div>
              <Progress value={subsPct} className={subsPct >= 90 ? "[&>div]:bg-destructive" : ""} />
            </div>
            {!workspace.isOwner ? (
              <p className="text-[11px] text-muted-foreground">Limits come from the workspace owner&rsquo;s plan.</p>
            ) : usage.planSlug !== "enterprise" && (
              <Link href="/dashboard/billing" className="text-[11px] font-medium text-foreground underline-offset-4 hover:underline">
                Upgrade plan →
              </Link>
            )}
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-md">
                    <AvatarFallback className="rounded-md text-xs">{initials(user.name, user.email)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name ?? "Account"}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <span className="truncate">{user.email}</span>
                  {user.role === "ADMIN" && (
                    <Badge variant="secondary" className="ml-auto h-5 gap-1 text-[10px]">
                      <ShieldIcon className="size-3" /> Admin
                    </Badge>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/billing">
                      <CreditCardIcon /> Plan & billing
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <SunIcon /> Theme
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                        <DropdownMenuRadioItem value="light">
                          <SunIcon /> Light
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dark">
                          <MoonIcon /> Dark
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="system">
                          <MonitorIcon /> System
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOutAction()}>
                  <LogOutIcon /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
