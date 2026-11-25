"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { GaugeIcon, InboxIcon, LayersIcon, MailIcon, PaletteIcon, UsersIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/admin", label: "Overview", icon: GaugeIcon, exact: true },
  { href: "/admin/users", label: "Users & plans", icon: UsersIcon },
  { href: "/admin/requests", label: "Upgrade requests", icon: InboxIcon, badgeKey: "pending" as const },
  { href: "/admin/settings", label: "Plans & contact", icon: LayersIcon },
  { href: "/admin/emails", label: "Email", icon: MailIcon },
  { href: "/admin/appearance", label: "Appearance", icon: PaletteIcon },
]

export function AdminNav({ pending }: { pending: number }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Admin sections" className="-mb-px flex gap-1 overflow-x-auto">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-2.5 pt-1 pb-2.5 text-sm transition-colors outline-none focus-visible:text-foreground",
              active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
            {item.badgeKey === "pending" && pending > 0 && (
              <Badge className="h-5 min-w-5 rounded-full bg-warm px-1.5 font-mono text-[11px] text-warm-foreground tabular-nums">{pending}</Badge>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
