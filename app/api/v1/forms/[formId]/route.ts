import { z } from "zod"

import { ApiError, apiRoute, json, ownedForm, readJson } from "@/lib/api/handler"
import { formToApi } from "@/lib/api/serializers"
import { FORM_MODES, normalizeSchema } from "@/lib/form-engine"
import { assertUniqueKeys } from "@/lib/forms/service"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

type P = { formId: string }

export const GET = apiRoute<P>("forms:read", async (ctx, { formId }) => json({ data: formToApi(await ownedForm(ctx, formId)) }))

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    mode: z.enum(FORM_MODES).optional(),
    status: z.enum(["PUBLISHED", "CLOSED"]).optional(),
    schema: z.object({ fields: z.array(z.any()).max(300), logic: z.array(z.any()).max(200).optional() }).passthrough().optional(),
  })
  .strict()

/** Updates metadata and/or the DRAFT schema. Live respondents keep seeing the published version until you publish. */
export const PATCH = apiRoute<P>("forms:write", async (ctx, { formId }) => {
  const form = await ownedForm(ctx, formId, "form.edit")
  const body = patchSchema.parse(await readJson(ctx.req))
  if (body.status === "PUBLISHED" && !form.publishedSchema) throw new ApiError(409, "not_published", "Publish the form first with POST /forms/{id}/publish.")
  let draftSchema: object | undefined
  if (body.schema) {
    const schema = normalizeSchema(body.schema)
    try {
      assertUniqueKeys(schema)
    } catch (e) {
      throw new ApiError(400, "invalid_schema", (e as Error).message)
    }
    draftSchema = schema as object
  }
  const updated = await prisma.form.update({
    where: { id: form.id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.mode ? { mode: body.mode } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(draftSchema ? { draftSchema } : {}),
    },
  })
  return json({ data: formToApi(updated) })
})

export const DELETE = apiRoute<P>("forms:write", async (ctx, { formId }) => {
  const form = await ownedForm(ctx, formId, "form.delete")
  await prisma.form.delete({ where: { id: form.id } })
  return json({ id: form.id, object: "form", deleted: true })
})
