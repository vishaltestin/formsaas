"use client"

import { useState } from "react"
import { BookmarkIcon, CheckIcon, CopyIcon } from "lucide-react"

import type { FormValues } from "@/lib/form-engine"

/** Inline "Save & continue later" panel rendered inside the themed form. */
export function ResumeBar({
  slug,
  preview,
  getValues,
  stepIndex,
  token,
  onToken,
}: {
  slug: string
  preview: boolean
  getValues: () => FormValues
  stepIndex: number
  token: string | null
  onToken: (token: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [message, setMessage] = useState("")
  const [url, setUrl] = useState("")
  const [copied, setCopied] = useState(false)

  const save = async () => {
    if (preview) {
      setState("saved")
      setUrl(`${window.location.origin}/f/${slug}?resume=preview-token`)
      setMessage("Preview mode — nothing was stored.")
      return
    }
    setState("saving")
    try {
      const values = getValues()
      // Uploaded files and signatures are large; keep drafts lean.
      const lean = Object.fromEntries(
        Object.entries(values).filter(([, v]) => !(typeof v === "string" && v.startsWith("data:")) && !(v && typeof v === "object" && "dataUrl" in (v as object)))
      )
      const res = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: lean, stepIndex, email: email.trim() || undefined, token: token ?? undefined }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string; url?: string; error?: string; expiresAt?: string }
      if (!res.ok || !data.ok || !data.token) throw new Error(data.error || "Couldn't save your progress")
      onToken(data.token)
      setUrl(data.url ?? "")
      setMessage(
        `${email.trim() ? `We emailed the link to ${email.trim()}. ` : ""}Link valid until ${data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : "later"}.`
      )
      setState("saved")
    } catch (e) {
      setState("error")
      setMessage(e instanceof Error ? e.message : "Couldn't save your progress")
    }
  }

  if (!open)
    return (
      <div className="fs-no-print mt-5 flex justify-center">
        <button type="button" className="fs-link inline-flex items-center gap-1.5 text-sm" onClick={() => setOpen(true)}>
          <BookmarkIcon className="size-3.5" /> Save &amp; continue later
        </button>
      </div>
    )

  return (
    <div className="fs-card fs-no-print mt-5 space-y-3 p-4 text-sm" role="region" aria-label="Save progress">
      {state === "saved" ? (
        <>
          <p className="flex items-center gap-1.5 font-medium">
            <CheckIcon className="size-4" /> Progress saved
          </p>
          <div className="flex gap-2">
            <input className="fs-input flex-1 font-mono text-xs" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Resume link" />
            <button
              type="button"
              className="fs-button fs-button-ghost px-3!"
              onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}
              aria-label="Copy resume link"
            >
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            </button>
          </div>
          <p className="fs-muted text-xs">{message}</p>
        </>
      ) : (
        <>
          <p className="font-medium">Save your progress</p>
          <p className="fs-muted text-xs">Get a private link to finish later. Add your email to receive it (optional).</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              className="fs-input min-w-0 flex-1"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email for resume link"
            />
            <button type="button" className="fs-button" onClick={() => void save()} disabled={state === "saving"}>
              {state === "saving" ? "Saving…" : "Save progress"}
            </button>
            <button type="button" className="fs-button fs-button-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          {state === "error" && <p className="fs-error-text text-xs">{message}</p>}
        </>
      )}
    </div>
  )
}
