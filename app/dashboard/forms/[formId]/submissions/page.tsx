import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { SubmissionsTable, type SubmissionRow } from "@/components/submissions/submissions-table"
import { hasScoring, isInputField, maxScore, normalizeMode, normalizeSchema, type FieldValue } from "@/lib/form-engine"
import { prisma } from "@/lib/prisma"
import { levelAllows } from "@/lib/rbac/policy"
import { requireFormAccess } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Submissions" }

export default async function SubmissionsPage(props: PageProps<"/dashboard/forms/[formId]/submissions">) {
  const { formId } = await props.params
  const { form, level } = await requireFormAccess(formId, "form.view")
  const schema = normalizeSchema(form.publishedSchema ?? form.draftSchema)
  const fields = schema.fields.filter(isInputField)
  const showScore = normalizeMode(form.mode) === "QUIZ" || hasScoring(schema)

  const [submissions, counts] = await Promise.all([
    prisma.submission.findMany({
      where: { formId },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.submission.groupBy({ by: ["status"], where: { formId }, _count: { _all: true } }),
  ])
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0

  const rows: SubmissionRow[] = submissions.map((s) => ({
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    status: s.status,
    score: s.computedScore,
    notes: s.notes,
    data: (s.data ?? {}) as Record<string, FieldValue>,
    metadata: (s.metadata ?? {}) as Record<string, unknown>,
  }))

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <PageHeader
        title="Submissions"
        description={`${submissions.length} total · ${countOf("NEW")} new · ${countOf("FLAGGED")} flagged`}
      />
      <SubmissionsTable formId={form.id} fields={fields} rows={rows} showScore={showScore} maxScore={maxScore(schema)} canReview={levelAllows(level, "submissions.review")} canDelete={levelAllows(level, "submissions.delete")} />
    </div>
  )
}
