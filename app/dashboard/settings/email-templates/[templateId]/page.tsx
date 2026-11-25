import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { TemplateEditor } from "@/components/email-templates/template-editor"
import {
  assetPath,
  assetUrl,
  templateUsage,
  workspaceAllowsCustomEmail,
} from "@/lib/email/template-store"
import { MERGE_TAGS, BLOCK_SNIPPETS } from "@/lib/email/template-library"
import { prisma } from "@/lib/prisma"
import { roleCan } from "@/lib/rbac/policy"
import { accessibleFormsWhere, requireWorkspace } from "@/lib/rbac/server"
import { isInputField, normalizeSchema } from "@/lib/form-engine"

export const metadata: Metadata = { title: "Edit email template" }

export default async function EditEmailTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const { user, membership } = await requireWorkspace("workspace.view")
  const template = await prisma.emailTemplate.findFirst({
    where: { id: templateId, workspaceId: membership.workspaceId },
  })
  if (!template) notFound()
  const [forms, assets, usage, allowed] = await Promise.all([
    prisma.form.findMany({
      where: accessibleFormsWhere(user.id, membership),
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, title: true, draftSchema: true },
    }),
    prisma.workspaceAsset.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, mime: true, size: true, createdAt: true },
    }),
    templateUsage(membership.workspaceId),
    workspaceAllowsCustomEmail(membership.workspaceId),
  ])
  return (
    <TemplateEditor
      workspaceId={membership.workspaceId}
      canEdit={roleCan(membership.role, "templates.manage") && allowed}
      allowed={allowed}
      template={{
        id: template.id,
        name: template.name,
        description: template.description ?? "",
        subject: template.subject,
        html: template.html,
      }}
      usedBy={usage.get(template.id) ?? []}
      forms={forms.map((f) => ({
        id: f.id,
        title: f.title,
        fields: normalizeSchema(f.draftSchema)
          .fields.filter(
            (x) =>
              isInputField(x) && x.type !== "password" && x.type !== "signature"
          )
          .map((x) => ({ key: x.key, label: x.label })),
      }))}
      mergeTags={MERGE_TAGS}
      snippets={BLOCK_SNIPPETS}
      assets={assets.map((a) => ({
        ...a,
        url: assetUrl(a),
        path: assetPath(a),
        createdAt: a.createdAt.toISOString(),
      }))}
      appOrigin={assetUrl({ id: "x", name: "x" }).replace(
        /\/api\/assets\/x\/x$/,
        ""
      )}
    />
  )
}
