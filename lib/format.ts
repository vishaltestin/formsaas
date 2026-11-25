export function formatDate(d: Date | string, opts?: Intl.DateTimeFormatOptions) {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString("en-US", opts ?? { month: "short", day: "numeric", year: "numeric" })
}

export function formatDateTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function timeAgo(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d
  const s = Math.round((Date.now() - date.getTime()) / 1000)
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(date)
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—"
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`
}

export function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim()
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")
}
