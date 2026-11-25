import "server-only"

import { getEffectivePlan } from "@/lib/entitlements"
export { safeAssetName, sniffImageType } from "@/lib/email/template-library"
import { appUrl } from "@/lib/format"
import { prisma } from "@/lib/prisma"

export const CUSTOM_EMAIL_PLAN_MESSAGE =
  "Custom HTML email templates are available on Pro and Enterprise plans."

/** Custom HTML emails follow the workspace owner's plan (they're billed for the workspace's forms). */
export async function workspaceAllowsCustomEmail(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  })
  if (!ws) return false
  return (await getEffectivePlan(ws.ownerId)).features.customBranding
}

/**
 * Loads a template for sending. Returns null (→ built-in design) when the id is
 * empty, belongs to another workspace, was deleted, or the plan no longer
 * includes custom emails.
 */
export async function loadTemplateForSend(
  workspaceId: string | null | undefined,
  templateId: string | null | undefined
) {
  if (!workspaceId || !templateId) return null
  const template = await prisma.emailTemplate.findFirst({
    where: { id: templateId, workspaceId },
    select: { id: true, name: true, subject: true, html: true },
  })
  if (!template) return null
  if (!(await workspaceAllowsCustomEmail(workspaceId))) return null
  return template
}

export function assetPath(asset: { id: string; name: string }) {
  return `/api/assets/${asset.id}/${encodeURIComponent(asset.name)}`
}

export function assetUrl(asset: { id: string; name: string }) {
  return `${appUrl()}${assetPath(asset)}`
}

/** Which forms / automations in the workspace use each template (for "Used by" and delete warnings). */
export async function templateUsage(workspaceId: string) {
  const [forms, automations] = await Promise.all([
    prisma.form.findMany({
      where: { workspaceId },
      select: { id: true, title: true, settings: true },
    }),
    prisma.automation.findMany({
      where: { form: { workspaceId } },
      select: { id: true, name: true, graph: true },
    }),
  ])
  const usage = new Map<string, string[]>()
  const add = (templateId: unknown, label: string) => {
    if (typeof templateId !== "string" || !templateId) return
    const list = usage.get(templateId) ?? []
    if (!list.includes(label)) list.push(label)
    usage.set(templateId, list)
  }
  for (const f of forms) {
    const s = (f.settings ?? {}) as {
      autoReply?: { templateId?: unknown }
      notifyTemplateId?: unknown
    }
    add(s.autoReply?.templateId, `${f.title} · thank-you`)
    add(s.notifyTemplateId, `${f.title} · notification`)
  }
  for (const a of automations) {
    const nodes =
      (
        (a.graph ?? {}) as {
          nodes?: {
            type?: string
            data?: { config?: { templateId?: unknown } }
          }[]
        }
      ).nodes ?? []
    for (const n of nodes)
      if (n.type === "email")
        add(n.data?.config?.templateId, `${a.name} · automation`)
  }
  return usage
}
