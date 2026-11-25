import Link from "next/link"

import { roleCan, type WorkspaceRole } from "@/lib/rbac/policy"
import { cn } from "@/lib/utils"

/** Server-rendered tab strip for workspace settings; items the role can't use are not rendered. */
export function SettingsNav({ active, role }: { active: "general" | "email"; role: WorkspaceRole }) {
  const items = [
    { id: "general", href: "/dashboard/settings", label: "General", show: true },
    { id: "email", href: "/dashboard/settings/email", label: "Email delivery", show: roleCan(role, "email.manage") },
  ].filter((i) => i.show)
  return (
    <nav aria-label="Settings sections" className="flex gap-1 border-b">
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          aria-current={active === i.id ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === i.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
