"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { prisma } from "@/lib/prisma"
import { assertFormAccess } from "@/lib/rbac/server"
import { changeSubmissionStatus } from "@/lib/submissions/status"

const STATUSES = ["NEW", "REVIEWED", "FLAGGED", "ARCHIVED"] as const
const idsSchema = z.array(z.string().min(1).max(40)).min(1).max(1000)

/** Loads a submission and requires submissions.review on its form. */
async function reviewableSubmission(submissionId: string) {
  const sub = await prisma.submission.findUnique({ where: { id: z.string().min(1).max(40).parse(submissionId) }, select: { formId: true } })
  if (!sub) throw new Error("Submission not found")
  await assertFormAccess(sub.formId, "submissions.review")
  return sub
}

function revalidate(formId: string) {
  revalidatePath(`/dashboard/forms/${formId}`, "layout")
}

export async function setSubmissionStatus(
  formId: string,
  ids: string[],
  status: (typeof STATUSES)[number]
): Promise<ActionResult<{ count: number }>> {
  try {
    await assertFormAccess(formId, "submissions.review")
    const parsedIds = idsSchema.parse(ids)
    const parsedStatus = z.enum(STATUSES).parse(status)
    const res = await changeSubmissionStatus(formId, parsedIds, parsedStatus)
    revalidate(formId)
    return ok({ count: res.count })
  } catch (e) {
    return fail(e)
  }
}

export async function deleteSubmissions(formId: string, ids: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    await assertFormAccess(formId, "submissions.delete")
    const res = await prisma.submission.deleteMany({ where: { formId, id: { in: idsSchema.parse(ids) } } })
    revalidate(formId)
    return ok({ count: res.count })
  } catch (e) {
    return fail(e)
  }
}

export async function updateSubmissionTags(submissionId: string, tags: string[]): Promise<ActionResult<{ tags: string[] }>> {
  try {
    const sub = await reviewableSubmission(submissionId)
    const clean = Array.from(new Set(z.array(z.string().trim().min(1).max(40)).max(50).parse(tags)))
    await prisma.submission.update({ where: { id: submissionId }, data: { tags: clean } })
    revalidate(sub.formId)
    return ok({ tags: clean })
  } catch (e) {
    return fail(e)
  }
}

export async function updateSubmissionNotes(submissionId: string, notes: string): Promise<ActionResult<{ notes: string }>> {
  try {
    const sub = await reviewableSubmission(submissionId)
    const clean = z.string().max(5000).parse(notes)
    await prisma.submission.update({ where: { id: submissionId }, data: { notes: clean || null } })
    revalidate(sub.formId)
    return ok({ notes: clean })
  } catch (e) {
    return fail(e)
  }
}
