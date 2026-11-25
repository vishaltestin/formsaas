"use client"

import { useEffect, useState } from "react"
import { LockIcon } from "lucide-react"

import { FormRenderer, type EmbedSource } from "@/components/renderer/form-renderer"
import { ThemeScope } from "@/components/renderer/theme-scope"
import type { ThemeConfig } from "@/lib/form-engine"
import type { PublicFormPayload } from "@/lib/public-form"
import { cn } from "@/lib/utils"

/** Broadcasts the document height to the parent window for auto-resizing iframes. */
export function EmbedBridge({ slug }: { slug: string }) {
  useEffect(() => {
    if (window.parent === window) return
    let last = 0
    const send = () => {
      const height = Math.ceil(document.documentElement.getBoundingClientRect().height)
      if (Math.abs(height - last) < 2) return
      last = height
      window.parent.postMessage({ type: "FORM_RESIZE", height, slug }, "*")
    }
    const ro = new ResizeObserver(send)
    ro.observe(document.documentElement)
    ro.observe(document.body)
    send()
    window.parent.postMessage({ type: "FORM_READY", slug }, "*")
    return () => ro.disconnect()
  }, [slug])
  return null
}

export function FormStatusScreen({
  theme,
  formId,
  title,
  message,
  embedded,
}: {
  theme: ThemeConfig
  formId: string
  title: string
  message: string
  embedded?: boolean
}) {
  return (
    <ThemeScope theme={theme} scopeId={formId} allowCustomCss={false}>
      <div className={cn("grid place-items-center px-4", embedded ? "py-10" : "min-h-svh py-16")}>
        <div className="fs-card w-full p-8 text-center" style={{ maxWidth: "min(var(--fs-max-width), 520px)" }}>
          <h1 className="fs-h2">{title}</h1>
          <p className="fs-muted mt-3">{message}</p>
        </div>
      </div>
    </ThemeScope>
  )
}

export function PasswordGate({
  slug,
  formId,
  title,
  theme,
  embedded,
  source,
}: {
  slug: string
  formId: string
  title: string
  theme: ThemeConfig
  embedded?: boolean
  source: EmbedSource
}) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [unlocked, setUnlocked] = useState<{ token: string | null; payload: PublicFormPayload } | null>(null)

  if (unlocked) {
    const p = unlocked.payload
    return (
      <FormRenderer
        formId={p.formId}
        slug={p.slug}
        title={p.title}
        description={p.description}
        mode={p.mode}
        schema={p.schema}
        theme={p.theme}
        settings={p.settings}
        logicEnabled={p.logicEnabled}
        showBadge={p.showBadge}
        allowCustomCss={p.allowCustomCss}
        allowBranding={p.allowBranding}
        maxUploadMb={p.maxUploadMb}
        unlockToken={unlocked.token ?? undefined}
        embedded={embedded}
        source={source}
      />
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending(true)
    setError(null)
    const res = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
    const data = await res.json().catch(() => ({}))
    setPending(false)
    if (!res.ok || !data.ok) return setError(data.error ?? "Incorrect password.")
    setUnlocked({ token: data.token, payload: data.payload })
  }

  return (
    <ThemeScope theme={theme} scopeId={formId} allowCustomCss={false}>
      <div className={cn("grid place-items-center px-4", embedded ? "py-10" : "min-h-svh py-16")}>
        <form onSubmit={submit} className="fs-card w-full p-8" style={{ maxWidth: 420 }}>
          <div
            className="mb-5 grid size-10 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--fs-primary) 12%, var(--fs-surface))", color: "var(--fs-primary)" }}
          >
            <LockIcon className="size-5" />
          </div>
          <h1 className="fs-h2">{title}</h1>
          <p className="fs-muted mt-1 text-sm">This form is password protected.</p>
          <label className="fs-label mt-6" htmlFor="fs-password">
            Password
          </label>
          <input
            id="fs-password"
            type="password"
            className="fs-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
            autoFocus
          />
          {error && <p className="fs-error-text">{error}</p>}
          <button type="submit" className="fs-button mt-5 w-full" disabled={pending || !password}>
            {pending ? "Checking…" : "Unlock form"}
          </button>
        </form>
      </div>
    </ThemeScope>
  )
}
