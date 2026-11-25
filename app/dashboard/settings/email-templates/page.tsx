import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { AssetLibrary } from "@/components/email-templates/asset-library"
import { TemplateList } from "@/components/email-templates/template-list"
import { SettingsNav } from "@/components/team/settings-nav"
import {
  assetPath,
  assetUrl,
  templateUsage,
  workspaceAllowsCustomEmail,
} from "@/lib/email/template-store"
import { TEMPLATE_STARTERS } from "@/lib/email/template-library"
import { formatDateTime } from "@/lib/format"
import { prisma } from "@/lib/prisma"
import { roleCan } from "@/lib/rbac/policy"
import { requireWorkspace } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Email templates" }

export default async function EmailTemplatesPage() {
  const { membership } = await requireWorkspace("workspace.view")
  const [templates, assets, usage, allowed] = await Promise.all([
    prisma.emailTemplate.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        subject: true,
        updatedAt: true,
        html: true,
      },
    }),
    prisma.workspaceAsset.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, mime: true, size: true, createdAt: true },
    }),
    templateUsage(membership.workspaceId),
    workspaceAllowsCustomEmail(membership.workspaceId),
  ])
  const canManage = roleCan(membership.role, "templates.manage")
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <PageHeader
        title="Workspace settings"
        description={`Your own HTML designs for the emails ${membership.workspaceName} sends — thank-you emails, response notifications and automation emails.`}
      />
      <SettingsNav active="templates" role={membership.role} />
      <TemplateList
        workspaceId={membership.workspaceId}
        canManage={canManage}
        allowed={allowed}
        starters={TEMPLATE_STARTERS.map(({ id, name, description }) => ({
          id,
          name,
          description,
        }))}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description ?? "",
          subject: t.subject,
          updatedAt: formatDateTime(t.updatedAt),
          sizeKb: Math.max(1, Math.round(Buffer.byteLength(t.html) / 1024)),
          usedBy: usage.get(t.id) ?? [],
        }))}
      />
      <AssetLibrary
        workspaceId={membership.workspaceId}
        canManage={canManage && allowed}
        initial={assets.map((a) => ({
          ...a,
          url: assetUrl(a),
          path: assetPath(a),
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
