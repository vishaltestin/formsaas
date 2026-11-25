import "server-only"

import { countryName, formatValue, getSteps, isInputField, normalizeSchema, type FieldValue, type FormField } from "@/lib/form-engine"
import { prisma } from "@/lib/prisma"

export type RangeDays = 7 | 30 | 90

export interface FieldBreakdown {
  key: string
  label: string
  type: FormField["type"]
  answered: number
  kind: "choice" | "rating" | "number" | "text" | "nps" | "boolean"
  options?: { label: string; count: number }[]
  average?: number
  min?: number
  max?: number
  nps?: { score: number; promoters: number; passives: number; detractors: number }
  samples?: string[]
}

export interface AnalyticsData {
  range: RangeDays
  kpis: {
    views: number
    starts: number
    submissions: number
    conversion: number
    completionRate: number
    avgSeconds: number
    prevSubmissions: number
    prevViews: number
  }
  daily: { date: string; views: number; submissions: number }[]
  funnel: { label: string; sessions: number }[]
  channels: { source: string; views: number; submissions: number }[]
  devices: { device: string; count: number }[]
  referrers: { host: string; count: number }[]
  fields: FieldBreakdown[]
}

const CHOICE = new Set(["select", "radio", "checkboxes", "multi_select", "image_choice"])
const DAY = 86400000

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

export async function getFormAnalytics(formId: string, range: RangeDays): Promise<AnalyticsData> {
  const now = new Date()
  const start = new Date(now.getTime() - range * DAY)
  start.setUTCHours(0, 0, 0, 0)
  const prevStart = new Date(start.getTime() - range * DAY)

  const [form, events, submissions, prevSubmissions, prevViewSessions] = await Promise.all([
    prisma.form.findUniqueOrThrow({ where: { id: formId }, select: { publishedSchema: true, draftSchema: true } }),
    prisma.formEvent.findMany({
      where: { formId, createdAt: { gte: start } },
      select: { type: true, stepIndex: true, source: true, sessionId: true, createdAt: true },
      take: 200000,
    }),
    prisma.submission.findMany({
      where: { formId, createdAt: { gte: start } },
      select: { data: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20000,
    }),
    prisma.submission.count({ where: { formId, createdAt: { gte: prevStart, lt: start } } }),
    prisma.formEvent.findMany({
      where: { formId, type: "VIEW", createdAt: { gte: prevStart, lt: start } },
      select: { sessionId: true },
      distinct: ["sessionId"],
    }),
  ])

  const schema = normalizeSchema(form.publishedSchema ?? form.draftSchema)
  const steps = getSteps(schema)

  const sessionsBy = (type: string, step?: number) =>
    new Set(events.filter((e) => e.type === type && (step === undefined || e.stepIndex === step)).map((e) => e.sessionId))

  const viewSessions = sessionsBy("VIEW")
  const startSessions = sessionsBy("START")
  const views = viewSessions.size
  const starts = startSessions.size
  const subs = submissions.length

  // Daily series (UTC days)
  const daily: AnalyticsData["daily"] = []
  const viewByDay = new Map<string, Set<string>>()
  for (const e of events) {
    if (e.type !== "VIEW") continue
    const k = dayKey(e.createdAt)
    if (!viewByDay.has(k)) viewByDay.set(k, new Set())
    viewByDay.get(k)!.add(e.sessionId)
  }
  const subByDay = new Map<string, number>()
  for (const s of submissions) subByDay.set(dayKey(s.createdAt), (subByDay.get(dayKey(s.createdAt)) ?? 0) + 1)
  for (let t = start.getTime(); t <= now.getTime(); t += DAY) {
    const k = dayKey(new Date(t))
    daily.push({ date: k, views: viewByDay.get(k)?.size ?? 0, submissions: subByDay.get(k) ?? 0 })
  }

  // Funnel
  const funnel: AnalyticsData["funnel"] = [
    { label: "Viewed", sessions: views },
    { label: "Started", sessions: starts },
  ]
  if (steps.length > 1) {
    steps.slice(0, -1).forEach((s, i) => {
      funnel.push({ label: `Completed ${s.title || `step ${i + 1}`}`, sessions: sessionsBy("STEP_COMPLETE", i).size })
    })
  }
  funnel.push({ label: "Submitted", sessions: subs })

  // Channels
  const sources = ["DIRECT", "IFRAME", "SCRIPT", "POPUP", "DRAWER"]
  const channels = sources
    .map((source) => ({
      source,
      views: new Set(events.filter((e) => e.type === "VIEW" && e.source === source).map((e) => e.sessionId)).size,
      submissions: submissions.filter((s) => ((s.metadata ?? {}) as { embedType?: string }).embedType === source).length,
    }))
    .filter((c) => c.views > 0 || c.submissions > 0)

  const deviceCounts = new Map<string, number>()
  const refCounts = new Map<string, number>()
  let totalSeconds = 0
  let timed = 0
  for (const s of submissions) {
    const m = (s.metadata ?? {}) as { device?: string; referrer?: string; completionSeconds?: number | null }
    deviceCounts.set(m.device || "unknown", (deviceCounts.get(m.device || "unknown") ?? 0) + 1)
    let host = "Direct / none"
    if (m.referrer) {
      try {
        host = new URL(m.referrer).hostname.replace(/^www\./, "")
      } catch {
        host = "Other"
      }
    }
    refCounts.set(host, (refCounts.get(host) ?? 0) + 1)
    if (typeof m.completionSeconds === "number" && m.completionSeconds > 0 && m.completionSeconds < 6 * 3600) {
      totalSeconds += m.completionSeconds
      timed++
    }
  }

  // Field breakdowns
  const fields: FieldBreakdown[] = []
  for (const f of schema.fields.filter(isInputField)) {
    if (f.type === "hidden" || f.type === "password" || f.type === "signature" || f.type === "file" || f.type === "consent") continue
    const values = submissions.map((s) => ((s.data ?? {}) as Record<string, FieldValue>)[f.key]).filter((v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
    const base = { key: f.key, label: f.label, type: f.type, answered: values.length }
    if (CHOICE.has(f.type)) {
      const counts = new Map<string, number>((f.options ?? []).map((o) => [o.value, 0]))
      for (const v of values) for (const x of Array.isArray(v) ? v : [v]) counts.set(String(x), (counts.get(String(x)) ?? 0) + 1)
      fields.push({
        ...base,
        kind: "choice",
        options: Array.from(counts.entries()).map(([value, count]) => ({ label: f.options?.find((o) => o.value === value)?.label ?? value, count })),
      })
    } else if (f.type === "yes_no") {
      const yes = values.filter((v) => v === true || v === "true").length
      fields.push({
        ...base,
        kind: "boolean",
        options: [
          { label: f.props?.yesLabel || "Yes", count: yes },
          { label: f.props?.noLabel || "No", count: values.length - yes },
        ],
      })
    } else if (f.type === "rating" || f.type === "scale") {
      const nums = values.map(Number).filter((n) => Number.isFinite(n))
      const lo = f.type === "rating" ? 1 : (f.props?.scaleMin ?? 1)
      const hi = f.type === "rating" ? (f.props?.maxRating ?? 5) : (f.props?.scaleMax ?? 5)
      const options = Array.from({ length: hi - lo + 1 }, (_, i) => ({ label: String(lo + i), count: nums.filter((n) => n === lo + i).length }))
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
      const isNps = f.type === "scale" && (f.props?.nps || (lo === 0 && hi === 10))
      if (isNps) {
        const promoters = nums.filter((n) => n >= 9).length
        const detractors = nums.filter((n) => n <= 6).length
        const passives = nums.length - promoters - detractors
        fields.push({
          ...base,
          kind: "nps",
          options,
          average: avg,
          nps: { score: nums.length ? Math.round(((promoters - detractors) / nums.length) * 100) : 0, promoters, passives, detractors },
        })
      } else fields.push({ ...base, kind: "rating", options, average: avg })
    } else if (f.type === "country") {
      const counts = new Map<string, number>()
      for (const v of values) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1)
      fields.push({
        ...base,
        kind: "choice",
        options: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([code, count]) => ({ label: countryName(code), count })),
      })
    } else if (f.type === "ranking") {
      // Share of respondents who ranked each option first.
      const counts = new Map<string, number>((f.options ?? []).map((o) => [o.value, 0]))
      for (const v of values) if (Array.isArray(v) && v[0]) counts.set(String(v[0]), (counts.get(String(v[0])) ?? 0) + 1)
      fields.push({
        ...base,
        kind: "choice",
        options: [...counts.entries()].map(([value, count]) => ({ label: `${f.options?.find((o) => o.value === value)?.label ?? value} (ranked 1st)`, count })),
      })
    } else if (f.type === "number" || f.type === "currency" || f.type === "slider") {
      const nums = values.map(Number).filter((n) => Number.isFinite(n))
      fields.push({
        ...base,
        kind: "number",
        average: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
        min: nums.length ? Math.min(...nums) : 0,
        max: nums.length ? Math.max(...nums) : 0,
      })
    } else {
      fields.push({
        ...base,
        kind: "text",
        samples: values.slice(0, 5).map((v) => (formatValue(f, v as FieldValue) || (typeof v === "object" ? JSON.stringify(v) : String(v))).slice(0, 200)),
      })
    }
  }

  return {
    range,
    kpis: {
      views,
      starts,
      submissions: subs,
      conversion: views ? subs / views : 0,
      completionRate: starts ? Math.min(1, subs / starts) : 0,
      avgSeconds: timed ? totalSeconds / timed : 0,
      prevSubmissions,
      prevViews: prevViewSessions.length,
    },
    daily,
    funnel,
    channels,
    devices: Array.from(deviceCounts.entries()).map(([device, count]) => ({ device, count })).sort((a, b) => b.count - a.count),
    referrers: Array.from(refCounts.entries()).map(([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    fields,
  }
}
