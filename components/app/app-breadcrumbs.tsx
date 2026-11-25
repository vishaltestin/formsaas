"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

const LABELS: Record<string, string> = {
  dashboard: "Forms",
  templates: "Templates",
  billing: "Plan & billing",
  developers: "Developers",
  automations: "Automations",
  edit: "Builder",
  logic: "Logic",
  share: "Share & embed",
  submissions: "Submissions",
  analytics: "Analytics",
  integrations: "Integrations",
  admin: "Admin",
  users: "Users & plans",
  appearance: "Appearance",
  requests: "Upgrade requests",
  emails: "Email delivery",
  settings: "Plans & contact",
  team: "Team",
  access: "Access",
  email: "Email delivery",
  "email-templates": "Email templates",
}

/** Segments whose label depends on the section (admin vs. workspace dashboard). */
const DASHBOARD_LABELS: Record<string, string> = {
  settings: "Settings",
}

export function AppBreadcrumbs({ formTitles }: { formTitles: Record<string, string> }) {
  const pathname = usePathname()
  const parts = pathname.split("/").filter(Boolean)
  const crumbs: { href: string; label: string }[] = []

  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]
    const href = "/" + parts.slice(0, i + 1).join("/")
    if (seg === "forms") continue
    if (parts[i - 1] === "forms") {
      crumbs.push({ href: `${href}/edit`, label: formTitles[seg] ?? "Form" })
      continue
    }
    if (parts[i - 1] === "email-templates") {
      crumbs.push({ href, label: "Edit template" })
      continue
    }
    const label = (parts[0] === "dashboard" ? DASHBOARD_LABELS[seg] : undefined) ?? LABELS[seg] ?? seg
    crumbs.push({ href, label })
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          <Fragment key={`${i}-${c.href}`}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className={i < crumbs.length - 2 ? "hidden md:inline-flex" : ""}>
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage className="max-w-[220px] truncate">{c.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={c.href} className="max-w-[200px] truncate">
                    {c.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
