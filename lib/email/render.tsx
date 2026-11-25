import "server-only"

import type { ReactElement } from "react"

import { escapeHtml } from "@/lib/email/escape"

/**
 * Renders a React Email template to HTML + plain text. When the renderer is
 * unavailable (e.g. a `react-server`-only test runtime) it falls back to a
 * minimal, still-readable HTML body so delivery never fails on rendering.
 */
export async function renderEmail(element: ReactElement, fallback: { heading: string; body: string; rows?: { label: string; value: string }[] }) {
  try {
    const { render } = await import("@react-email/render")
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
    return { html, text }
  } catch {
    const rows = (fallback.rows ?? [])
      .map((r) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${escapeHtml(r.label)}</td><td>${escapeHtml(r.value)}</td></tr>`)
      .join("")
    const paras = fallback.body
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("")
    const html = `<h1 style="font-size:20px">${escapeHtml(fallback.heading)}</h1>${paras}${rows ? `<table>${rows}</table>` : ""}`
    const text = [fallback.heading, fallback.body, ...(fallback.rows ?? []).map((r) => `${r.label}: ${r.value}`)].join("\n\n")
    return { html, text }
  }
}
