import "server-only"

import { dispatchAutomationTrigger } from "@/lib/automations/runner"
import { prisma } from "@/lib/prisma"
import { runAfter } from "@/lib/signing"

export const SUBMISSION_STATUSES = ["NEW", "REVIEWED", "FLAGGED", "ARCHIVED"] as const
export type SubmissionStatusValue = (typeof SUBMISSION_STATUSES)[number]

/**
 * Changes the status of submissions and fires "Submission status changed"
 * automations for every row whose status actually changed.
 */
export async function changeSubmissionStatus(formId: string, ids: string[], status: SubmissionStatusValue) {
  const before = await prisma.submission.findMany({ where: { formId, id: { in: ids } }, select: { id: true, status: true } })
  const changed = before.filter((s) => s.status !== status)
  if (changed.length === 0) return { count: 0 }
  const res = await prisma.submission.updateMany({ where: { formId, id: { in: changed.map((c) => c.id) } }, data: { status } })
  const hasAutomations = await prisma.automation.count({ where: { formId, enabled: true, trigger: "STATUS_CHANGED" } })
  if (hasAutomations) {
    const batch = changed.slice(0, 100)
    await runAfter(async () => {
      for (const s of batch) await dispatchAutomationTrigger(formId, "STATUS_CHANGED", { submissionId: s.id, previousStatus: s.status })
    })
  }
  return { count: res.count }
}
