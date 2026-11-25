import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PrintButton } from "@/components/receipt/print-button"
import { ReceiptDocument } from "@/components/receipt/receipt-document"
import { normalizeSchema, normalizeTheme } from "@/lib/form-engine"
import { prisma } from "@/lib/prisma"
import { levelAllows } from "@/lib/rbac/policy"
import { resolveFormAccess } from "@/lib/rbac/server"
import { getSessionUser } from "@/lib/session"
import { verifyValue } from "@/lib/signing"

export const metadata: Metadata = { title: { absolute: "Submission receipt" }, robots: { index: false } }

export default async function ReceiptPage(props: PageProps<"/f/[slug]/receipt/[submissionId]">) {
  const { slug, submissionId } = await props.params
  const sp = await props.searchParams
  const sig = typeof sp.sig === "string" ? sp.sig : null

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { form: { select: { id: true, slug: true, title: true, description: true, userId: true, publishedSchema: true, draftSchema: true, themeConfig: true } } },
  })
  if (!submission || submission.form.slug !== slug) notFound()

  // Access: a valid signed link (respondent) or a workspace member with view access to the form.
  let allowed = verifyValue("receipt", submission.id, sig)
  if (!allowed) {
    const user = await getSessionUser()
    const access = user ? await resolveFormAccess(user.id, submission.form.id) : null
    allowed = !!access && levelAllows(access.level, "form.view")
  }
  if (!allowed) notFound()

  const schema = normalizeSchema(submission.form.publishedSchema ?? submission.form.draftSchema)
  const theme = normalizeTheme(submission.form.themeConfig)

  return (
    <main className="receipt-page min-h-svh bg-neutral-100 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between print:hidden">
        <p className="text-sm text-neutral-600">A4 receipt · use “Save as PDF” in the print dialog to download.</p>
        <PrintButton />
      </div>
      <ReceiptDocument
        receipt={{
          formTitle: submission.form.title,
          formDescription: submission.form.description,
          submissionId: submission.id,
          createdAt: submission.createdAt,
          score: submission.computedScore,
          status: submission.status,
          schema,
          data: (submission.data ?? {}) as Record<string, unknown>,
          brandColor: theme.colors.primary,
        }}
      />
    </main>
  )
}
