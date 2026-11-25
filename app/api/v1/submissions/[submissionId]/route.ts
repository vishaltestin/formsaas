import { z } from "zod"

import { ApiError, apiRoute, json, ownedForm, readJson, type ApiContext } from "@/lib/api/handler"
import type { FormPermission } from "@/lib/rbac/policy"
import { submissionToApi } from "@/lib/api/serializers"
import { prisma } from "@/lib/prisma"
import { changeSubmissionStatus, SUBMISSION_STATUSES } from "@/lib/submissions/status"

export const runtime = "nodejs"

type P = { submissionId: string }

async function ownedSubmission(ctx: ApiContext, id: string, permission: FormPermission = "form.view") {
  const sub = await prisma.submission.findUnique({ where: { id: z.string().max(40).parse(id) } })
  if (!sub) throw new ApiError(404, "not_found", "Submission not found.")
  try {
    await ownedForm(ctx, sub.formId, permission)
  } catch (e) {
    // Don't reveal that a submission exists in a form the key can't see.
    if (e instanceof ApiError && e.status === 404) throw new ApiError(404, "not_found", "Submission not found.")
    throw e
  }
  return sub
}

export const GET = apiRoute<P>("submissions:read", async (ctx, { submissionId }) => json({ data: submissionToApi(await ownedSubmission(ctx, submissionId)) }))

const patchSchema = z
  .object({
    status: z.enum(SUBMISSION_STATUSES).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
    notes: z.string().max(20000).nullable().optional(),
  })
  .strict()

/** Updates review fields. Answers are immutable. Status changes fire "status changed" automations. */
export const PATCH = apiRoute<P>("submissions:write", async (ctx, { submissionId }) => {
  const sub = await ownedSubmission(ctx, submissionId, "submissions.review")
  const body = patchSchema.parse(await readJson(ctx.req))
  if (body.tags !== undefined || body.notes !== undefined)
    await prisma.submission.update({
      where: { id: sub.id },
      data: { ...(body.tags !== undefined ? { tags: Array.from(new Set(body.tags)) } : {}), ...(body.notes !== undefined ? { notes: body.notes } : {}) },
    })
  if (body.status) await changeSubmissionStatus(sub.formId, [sub.id], body.status)
  return json({ data: submissionToApi(await prisma.submission.findUniqueOrThrow({ where: { id: sub.id } })) })
})

export const DELETE = apiRoute<P>("submissions:write", async (ctx, { submissionId }) => {
  const sub = await ownedSubmission(ctx, submissionId, "submissions.delete")
  await prisma.submission.delete({ where: { id: sub.id } })
  return json({ id: sub.id, object: "submission", deleted: true })
})
