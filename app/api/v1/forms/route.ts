import { z } from "zod"

import { ApiError, apiRoute, json, pageParams, readJson } from "@/lib/api/handler"
import { formToApi } from "@/lib/api/serializers"
import { FORM_MODES } from "@/lib/form-engine"
import { createFormRecord } from "@/lib/forms/service"
import { prisma } from "@/lib/prisma"
import { accessibleFormsWhere } from "@/lib/rbac/core"
import { roleCan } from "@/lib/rbac/policy"

export const runtime = "nodejs"

export const GET = apiRoute("forms:read", async (ctx) => {
  const { limit, cursor } = pageParams(ctx.req)
  const status = ctx.req.nextUrl.searchParams.get("status")
  const forms = await prisma.form.findMany({
    where: { AND: [accessibleFormsWhere(ctx.userId, ctx.membership)], ...(status && ["DRAFT", "PUBLISHED", "CLOSED"].includes(status) ? { status: status as "DRAFT" } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  const page = forms.slice(0, limit)
  return json({ object: "list", data: page.map(formToApi), hasMore: forms.length > limit, nextCursor: forms.length > limit ? page[page.length - 1].id : null })
})

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  mode: z.enum(FORM_MODES).optional(),
  templateId: z.string().max(80).optional(),
  schema: z.object({ fields: z.array(z.any()).max(300), logic: z.array(z.any()).max(200).optional() }).passthrough().optional(),
})

export const POST = apiRoute("forms:write", async (ctx) => {
  if (!roleCan(ctx.membership.role, "form.create")) throw new ApiError(403, "forbidden", "Your role in this workspace can't create forms.")
  const body = createSchema.parse(await readJson(ctx.req))
  const form = await createFormRecord({ workspaceId: ctx.workspaceId, ownerId: ctx.membership.ownerId, createdById: ctx.userId }, { title: body.title, description: body.description, mode: body.mode, templateId: body.templateId, schema: body.schema })
  return json({ data: formToApi(form) }, 201)
})
