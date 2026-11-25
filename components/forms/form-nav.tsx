"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3Icon,
  ExternalLinkIcon,
  InboxIcon,
  KeyRoundIcon,
  PencilRulerIcon,
  Share2Icon,
  WaypointsIcon,
  WebhookIcon,
  WorkflowIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { LEVEL_DESCRIPTIONS, LEVEL_LABELS, type AccessLevel, type FormSection } from "@/lib/rbac/policy"
import { cn } from "@/lib/utils"

const TABS = [
  { seg: "edit", label: "Build", icon: PencilRulerIcon },
  { seg: "logic", label: "Logic", icon: WaypointsIcon },
  { seg: "share", label: "Share", icon: Share2Icon },
  { seg: "submissions", label: "Submissions", icon: InboxIcon },
  { seg: "analytics", label: "Analytics", icon: BarChart3Icon },
  { seg: "automations", label: "Automations", icon: WorkflowIcon },
  { seg: "integrations", label: "Integrations", icon: WebhookIcon },
  { seg: "access", label: "Access", icon: KeyRoundIcon },
] as const satisfies readonly { seg: FormSection; label: string; icon: unknown }[]

export function FormNav({
  formId,
  slug,
  status,
  newCount,
  sections,
  level,
  workspaceName,
}: {
  formId: string
  slug: string
  status: "DRAFT" | "PUBLISHED" | "CLOSED"
  newCount: number
  /** Sections the caller's access level allows — computed server-side. */
  sections: FormSection[]
  level: AccessLevel
  workspaceName: string
}) {
  const pathname = usePathname()
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
      <nav className="-mb-px flex h-full min-w-0 items-stretch gap-1.5 overflow-x-auto" aria-label="Form sections">
        {TABS.filter((t) => sections.includes(t.seg)).map((t) => {
          const href = `/dashboard/forms/${formId}/${t.seg}`
          const active = pathname.startsWith(href)
          return (
            <Link
              key={t.seg}
              href={href}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3 text-[13px] whitespace-nowrap transition-colors",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
              {t.seg === "submissions" && newCount > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
                  {newCount}
                </Badge>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {level !== "MANAGE" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="hidden font-normal text-muted-foreground md:inline-flex">
                {LEVEL_LABELS[level]} access
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {LEVEL_DESCRIPTIONS[level]} Workspace: {workspaceName}
            </TooltipContent>
          </Tooltip>
        )}
        <Badge
          variant={status === "PUBLISHED" ? "default" : "outline"}
          className={cn(status === "PUBLISHED" && "bg-emerald-600 text-white dark:bg-emerald-500")}
        >
          {status === "PUBLISHED" ? "Live" : status === "CLOSED" ? "Closed" : "Draft"}
        </Badge>
        {status !== "DRAFT" && (
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <a href={`/f/${slug}`} target="_blank" rel="noreferrer">
              Open <ExternalLinkIcon />
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}
