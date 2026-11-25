"use client"

import { useCallback, useMemo, useState } from "react"
import { CheckIcon, CircleIcon, XIcon } from "lucide-react"

import { FormRenderer } from "@/components/renderer/form-renderer"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { renderTemplate } from "@/lib/automations/template"
import {
  computeScore,
  defaultSchema,
  defaultSettings,
  defaultTheme,
  toPublicSettings,
  validateValues,
  type FormMode,
  type FormSchema,
  type FormValues,
  type LogicResult,
} from "@/lib/form-engine"
import { cn } from "@/lib/utils"

const SCHEMA: FormSchema = {
  ...defaultSchema(),
  fields: [
    { id: "f_name", key: "name", type: "short_text", label: "Full name", required: true, placeholder: "Ada Lovelace", width: "half", validation: { minLength: 2 } },
    { id: "f_email", key: "email", type: "email", label: "Work email", required: true, placeholder: "ada@company.com", width: "half" },
    { id: "s_team", key: "step_team", type: "step_break", label: "Your team" },
    { id: "f_team", key: "team_size", type: "number", label: "Team size", required: true, placeholder: "25", validation: { min: 1, max: 5000 } },
    {
      id: "f_plan",
      key: "plan",
      type: "radio",
      label: "Which plan fits?",
      required: true,
      options: [
        { id: "o_starter", label: "Starter", value: "starter", points: 0 },
        { id: "o_growth", label: "Growth", value: "growth", points: 5 },
        { id: "o_scale", label: "Scale", value: "scale", points: 10 },
      ],
    },
    { id: "f_phone", key: "phone", type: "phone", label: "Direct phone", helpText: "Shown by a logic rule when team size is over 50.", required: true },
    { id: "f_est", key: "monthly_estimate", type: "calculated", label: "Monthly estimate", props: { formula: "{{team_size}} * 12", decimals: 0, prefix: "$" } },
  ],
  logic: [
    {
      id: "r_big",
      name: "Large teams leave a phone number",
      enabled: true,
      combinator: "AND",
      conditions: [{ id: "c1", fieldId: "f_team", operator: "greater_than", value: "50" }],
      actions: [{ id: "a1", type: "SHOW_FIELD", targetFieldId: "f_phone" }],
    },
  ],
  quiz: {
    showLiveScore: true,
    revealScore: true,
    outcomes: [
      { id: "q1", minScore: 0, maxScore: 4, title: "Self-serve fit", message: "Starter covers you." },
      { id: "q2", minScore: 5, maxScore: 10, title: "Sales-assisted", message: "We'll reach out." },
    ],
  },
}

const SETTINGS = { ...toPublicSettings(defaultSettings()), successTitle: "Thanks, {{name}}", successMessage: "This preview never leaves your browser." }
const THEME = defaultTheme("studio")
const MODES: { value: FormMode; label: string }[] = [
  { value: "CLASSIC", label: "Classic" },
  { value: "STEPPER", label: "Stepper" },
  { value: "CARD", label: "Cards" },
  { value: "QUIZ", label: "Quiz" },
]

interface Snapshot {
  values: FormValues
  logic: LogicResult | null
}

function byKey(values: FormValues, logic: LogicResult | null) {
  const out: Record<string, unknown> = {}
  for (const f of SCHEMA.fields) {
    if (f.type === "step_break") continue
    if (logic && !logic.visibleFieldIds.has(f.id)) continue
    const v = logic?.setValues[f.id] ?? values[f.id]
    if (v === "" || v === null || v === undefined) continue
    out[f.key] = f.type === "number" && v !== "" ? Number(v) : v
  }
  return out
}

export function HeroSandbox() {
  const [mode, setMode] = useState<FormMode>("STEPPER")
  const [snap, setSnap] = useState<Snapshot>({ values: {}, logic: null })
  const onValuesChange = useCallback((values: FormValues, logic: LogicResult) => setSnap({ values: { ...values }, logic }), [])

  const data = useMemo(() => byKey(snap.values, snap.logic), [snap])
  const issues = useMemo(() => {
    if (!snap.logic) return []
    const res = validateValues(SCHEMA, { ...snap.values, ...snap.logic.setValues }, snap.logic.visibleFieldIds, { requiredIds: snap.logic.required })
    if (res.success) return []
    return Object.entries(res.errors).map(([id, message]) => ({ key: SCHEMA.fields.find((f) => f.id === id)?.key ?? id, message }))
  }, [snap])
  const score = useMemo(() => computeScore(SCHEMA, snap.values, snap.logic?.visibleFieldIds), [snap])
  const big = Number(data.team_size ?? 0) > 50
  const scope = { trigger: { data, score }, nodes: { http_1: { status: 201, body: { id: "lead_8f2c" } } } }

  return (
    <div className="overflow-hidden rounded-lg border bg-background shadow-xs">
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
        <span className="font-mono text-xs text-muted-foreground">forms.digitalfueled.com/f/demo</span>
        <ToggleGroup type="single" variant="outline" size="sm" className="ml-auto" value={mode} onValueChange={(v) => v && setMode(v as FormMode)} aria-label="Form mode">
          {MODES.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} className="px-2.5 text-xs">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="grid lg:grid-cols-[1.15fr_1fr]">
        <div className="max-h-[560px] min-h-[460px] overflow-y-auto border-b lg:border-r lg:border-b-0">
          <FormRenderer
            key={mode}
            formId="sandbox"
            slug="sandbox"
            title="Book a product demo"
            description="Try it — validation, logic and the formula run live."
            mode={mode}
            schema={SCHEMA}
            theme={THEME}
            settings={SETTINGS}
            preview
            embedded
            onValuesChange={onValuesChange}
          />
        </div>
        <Tabs defaultValue="validation" className="min-w-0 gap-0">
          <TabsList variant="line" className="w-full justify-start border-b px-3">
            <TabsTrigger value="validation">Zod</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="api">API</TabsTrigger>
          </TabsList>
          <TabsContent value="validation" className="space-y-3 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Same schema runs in the browser and on the server</span>
              <Badge variant={issues.length ? "outline" : "secondary"} className="font-mono tabular-nums">
                {issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "valid"}
              </Badge>
            </div>
            <ul className="divide-y rounded-md border text-xs">
              {SCHEMA.fields
                .filter((f) => f.type !== "step_break" && (!snap.logic || snap.logic.visibleFieldIds.has(f.id)))
                .map((f) => {
                  const issue = issues.find((i) => i.key === f.key)
                  return (
                    <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                      {f.type === "calculated" ? (
                        <CircleIcon className="size-3.5 text-muted-foreground" />
                      ) : issue ? (
                        <XIcon className="size-3.5 text-destructive" />
                      ) : (
                        <CheckIcon className="size-3.5 text-primary" />
                      )}
                      <code className="font-mono">{f.key}</code>
                      <span className={cn("ml-auto truncate", issue ? "text-destructive" : "text-muted-foreground")}>
                        {f.type === "calculated" ? `= ${data.monthly_estimate ?? "—"} (server-computed)` : (issue?.message ?? "ok")}
                      </span>
                    </li>
                  )
                })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Type a team size over 50 to watch the logic rule reveal <code className="font-mono">phone</code> and make it required.
            </p>
          </TabsContent>
          <TabsContent value="automation" className="space-y-2 p-4 text-xs">
            {[
              { id: "trigger", label: "Form submitted", detail: `email = ${renderTemplate("{{trigger.data.email | \"—\"}}", scope)}`, state: "done" },
              { id: "if_1", label: "IF team_size > 50", detail: big ? "→ true branch" : "→ false branch", state: "done" },
              { id: "http_1", label: "HTTP POST /crm/leads", detail: renderTemplate('{"email":"{{trigger.data.email | "…"}}","seats":{{trigger.data.team_size | "0"}}}', scope), state: big ? "done" : "skip" },
              { id: "slack_1", label: "Slack #sales", detail: renderTemplate("New lead {{trigger.data.name | \"…\"}} — CRM id {{nodes.http_1.body.id}}", scope), state: big ? "done" : "skip" },
              { id: "email_1", label: "Send email", detail: renderTemplate("Hi {{trigger.data.name | \"there\"}}, here is your Starter guide.", scope), state: big ? "skip" : "done" },
            ].map((n, i) => (
              <div key={n.id} className={cn("flex gap-3 rounded-md border px-3 py-2", n.state === "skip" && "opacity-45")}>
                <span className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{n.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{n.id}</span>
                    <span className={cn("ml-auto font-mono text-[10px]", n.state === "done" ? "text-primary" : "text-muted-foreground")}>{n.state === "done" ? "SUCCESS" : "SKIPPED"}</span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{n.detail}</p>
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="api" className="space-y-2 p-4">
            <p className="text-xs text-muted-foreground">The same payload, submitted with a scoped API key:</p>
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
              {`curl -X POST https://forms.digitalfueled.com/api/v1/forms/frm_demo/submissions \\
  -H "Authorization: Bearer fs_live_••••" \\
  -H "Idempotency-Key: ${Object.keys(data).length}-demo" \\
  -d '${JSON.stringify({ data }, null, 2)}'`}
            </pre>
            <pre className="overflow-x-auto rounded-md border p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {issues.length
                ? JSON.stringify({ error: { code: "invalid_request", details: issues.map((i) => ({ path: i.key, message: i.message })) } }, null, 2)
                : JSON.stringify({ data: { id: "sub_9x2k", score, data } }, null, 2)}
            </pre>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
