import { apiRoute, json, ownedForm } from "@/lib/api/handler"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export const GET = apiRoute<{ formId: string }>("forms:read", async (ctx, { formId }) => {
  const form = await ownedForm(ctx, formId)
  const rows = await prisma.automation.findMany({ where: { formId: form.id }, orderBy: { createdAt: "asc" } })
  return json({
    object: "list",
    data: rows.map((a) => ({ id: a.id, object: "automation", name: a.name, enabled: a.enabled, trigger: a.trigger, updatedAt: a.updatedAt.toISOString() })),
  })
})
