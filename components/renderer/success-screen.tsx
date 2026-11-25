"use client"

import { useEffect, useState } from "react"
import { CheckIcon, DownloadIcon, ExternalLinkIcon, PrinterIcon, TrophyIcon } from "lucide-react"

import {
  formatValue,
  isEmptyValue,
  isFileValue,
  isInputField,
  type CompletionResult,
  type FormSchema,
  type FormValues,
} from "@/lib/form-engine"

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

export function SuccessScreen({
  completion,
  schema,
  answers,
  formTitle,
  submissionId,
  receiptUrl = null,
  preview,
  embedded,
}: {
  completion: CompletionResult
  schema: FormSchema
  answers: FormValues
  formTitle: string
  submissionId: string | null
  receiptUrl?: string | null
  preview?: boolean
  embedded?: boolean
}) {
  const [countdown, setCountdown] = useState(completion.redirectUrl ? completion.redirectDelay : -1)
  const [showReceipt, setShowReceipt] = useState(false)

  const rows = schema.fields
    .filter((f) => isInputField(f) && f.type !== "hidden" && f.type !== "password")
    .filter((f) => !isEmptyValue(answers[f.id]))
    .map((f) => ({ field: f, value: answers[f.id], text: formatValue(f, answers[f.id]) }))

  useEffect(() => {
    if (!completion.redirectUrl || preview) return
    if (countdown <= 0) {
      const target = new URL(completion.redirectUrl)
      if (completion.forwardParams) {
        new URLSearchParams(window.location.search).forEach((v, k) => {
          if (!target.searchParams.has(k)) target.searchParams.set(k, v)
        })
        if (submissionId) target.searchParams.set("submission_id", submissionId)
      }
      const href = target.toString()
      try {
        if (embedded && window.top && window.top !== window.self) window.top.location.href = href
        else window.location.href = href
      } catch {
        window.open(href, "_blank", "noopener")
      }
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, completion, preview, submissionId, embedded])

  const downloadReceipt = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt — ${escapeHtml(formTitle)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;color:#111;padding:0 16px}h1{font-size:20px}dt{font-weight:600;margin-top:14px}dd{margin:4px 0 0;color:#333}small{color:#666}</style></head>
<body><h1>${escapeHtml(formTitle)}</h1><small>Submitted ${new Date().toLocaleString()}${submissionId ? ` · Reference ${escapeHtml(submissionId)}` : ""}</small><dl>
${rows
  .map((r) =>
    r.field.type === "signature" && typeof r.value === "string"
      ? `<dt>${escapeHtml(r.field.label)}</dt><dd><img src="${r.value}" alt="signature" style="max-height:90px"/></dd>`
      : `<dt>${escapeHtml(r.field.label)}</dt><dd>${escapeHtml(r.text)}</dd>`
  )
  .join("\n")}
</dl></body></html>`
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `receipt-${submissionId ?? "preview"}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col items-center py-6 text-center duration-300 animate-in fade-in zoom-in-95">
      <div
        className="mb-5 grid size-12 place-items-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--fs-primary) 12%, var(--fs-surface))", color: "var(--fs-primary)" }}
      >
        {completion.score !== null ? <TrophyIcon className="size-6" /> : <CheckIcon className="size-6" />}
      </div>
      <h2 className="fs-h2">{completion.title}</h2>
      {completion.message && <p className="fs-muted mt-3 max-w-md whitespace-pre-line">{completion.message}</p>}

      {completion.score !== null && completion.maxScore !== null && (
        <div className="fs-card mt-6 w-full max-w-xs px-5 py-4">
          <div className="fs-muted text-xs tracking-wide uppercase">Your score</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {completion.score}
            <span className="fs-muted text-lg font-normal"> / {completion.maxScore}</span>
          </div>
          <div className="fs-progress mt-3">
            <div style={{ width: `${completion.maxScore ? Math.max(0, Math.min(100, (completion.score / completion.maxScore) * 100)) : 0}%` }} />
          </div>
          {completion.outcomeTitle && <div className="mt-3 text-sm font-medium">{completion.outcomeTitle}</div>}
        </div>
      )}

      {completion.redirectUrl && (
        <p className="fs-muted mt-5 text-sm">
          {preview
            ? `Respondents will be redirected to ${completion.redirectUrl}`
            : countdown > 0
              ? `Redirecting in ${countdown}s…`
              : "Redirecting…"}
        </p>
      )}

      <div className="fs-no-print mt-7 flex flex-wrap justify-center gap-2">
        {completion.ctaLabel && completion.ctaUrl && (
          <a href={completion.ctaUrl} target="_blank" rel="noreferrer" className="fs-button">
            {completion.ctaLabel} <ExternalLinkIcon className="size-4" />
          </a>
        )}
        {completion.showReceipt && rows.length > 0 && (
          <button type="button" className="fs-button fs-button-ghost" onClick={() => setShowReceipt((s) => !s)}>
            {showReceipt ? "Hide receipt" : "View receipt"}
          </button>
        )}
        {receiptUrl && (
          <a href={receiptUrl} target="_blank" rel="noreferrer" className="fs-button fs-button-ghost">
            Printable receipt (A4/PDF)
          </a>
        )}
      </div>

      {showReceipt && (
        <div className="fs-print fs-card mt-6 w-full p-5 text-left">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{formTitle}</div>
              <div className="fs-muted text-xs">
                {new Date().toLocaleString()} {submissionId && <>· Ref {submissionId.slice(-8).toUpperCase()}</>}
              </div>
            </div>
            <div className="fs-no-print flex gap-1">
              <button type="button" className="fs-button fs-button-ghost px-2.5! py-1.5!" onClick={() => window.print()} aria-label="Print receipt">
                <PrinterIcon className="size-4" />
              </button>
              <button type="button" className="fs-button fs-button-ghost px-2.5! py-1.5!" onClick={downloadReceipt} aria-label="Download receipt">
                <DownloadIcon className="size-4" />
              </button>
            </div>
          </div>
          <dl className="grid gap-3 text-sm">
            {rows.map((r) => (
              <div key={r.field.id} className="grid gap-0.5 border-t pt-3">
                <dt className="fs-muted text-xs">{r.field.label}</dt>
                <dd className="break-words">
                  {r.field.type === "signature" && typeof r.value === "string" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.value} alt="Signature" className="h-16 w-auto" />
                  ) : r.field.type === "file" && isFileValue(r.value) && r.value.type.startsWith("image/") && r.value.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.value.dataUrl} alt={r.value.name} className="max-h-32 w-auto rounded" />
                  ) : (
                    r.text
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
