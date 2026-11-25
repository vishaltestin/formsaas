import { apiRoute, json, ownedForm } from "@/lib/api/handler"
import { getFormAnalytics, type RangeDays } from "@/lib/analytics"

export const runtime = "nodejs"

export const GET = apiRoute<{ formId: string }>("analytics:read", async (ctx, { formId }) => {
  const form = await ownedForm(ctx, formId)
  const d = Number(ctx.req.nextUrl.searchParams.get("days") ?? 30)
  const range: RangeDays = d === 7 || d === 90 ? d : 30
  const a = await getFormAnalytics(form.id, range)
  return json({
    data: {
      object: "analytics",
      formId: form.id,
      rangeDays: a.range,
      totals: a.kpis,
      daily: a.daily,
      funnel: a.funnel,
      channels: a.channels,
      devices: a.devices,
      referrers: a.referrers,
      fields: a.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, answered: f.answered, options: f.options, average: f.average, nps: f.nps })),
    },
  })
})
