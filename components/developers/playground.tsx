"use client"

import { useMemo, useState } from "react"
import { PlayIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { CopyButton } from "./api-keys-panel"

export interface PlaygroundForm {
  id: string
  title: string
  status: string
  fields: { key: string; type: string; label: string; required: boolean; options?: string[]; sample: unknown }[]
  submissionIds: string[]
  automations: { id: string; name: string; trigger: string; enabled: boolean }[]
}

type Method = "GET" | "POST" | "PATCH" | "DELETE"
interface Endpoint {
  id: string
  group: string
  method: Method
  path: string
  label: string
  scope: string | null
  body?: (form: PlaygroundForm | undefined) => unknown
  idempotent?: boolean
}

const ENDPOINTS: Endpoint[] = [
  { id: "me", group: "Keys", method: "GET", path: "/me", label: "Introspect key", scope: null },
  { id: "forms.list", group: "Forms", method: "GET", path: "/forms?limit=10", label: "List forms", scope: "forms:read" },
  { id: "forms.get", group: "Forms", method: "GET", path: "/forms/{formId}", label: "Retrieve form", scope: "forms:read" },
  {
    id: "forms.create",
    group: "Forms",
    method: "POST",
    path: "/forms",
    label: "Create form",
    scope: "forms:write",
    body: () => ({ title: "Created from the API", mode: "CLASSIC", templateId: "contact" }),
  },
  { id: "forms.update", group: "Forms", method: "PATCH", path: "/forms/{formId}", label: "Update form", scope: "forms:write", body: (f) => ({ title: f ? `${f.title}` : "Renamed" }) },
  { id: "forms.publish", group: "Forms", method: "POST", path: "/forms/{formId}/publish", label: "Publish draft", scope: "forms:write" },
  { id: "subs.list", group: "Submissions", method: "GET", path: "/forms/{formId}/submissions?limit=10", label: "List submissions", scope: "submissions:read" },
  {
    id: "subs.create",
    group: "Submissions",
    method: "POST",
    path: "/forms/{formId}/submissions",
    label: "Create submission",
    scope: "submissions:write",
    idempotent: true,
    body: (f) => ({
      data: Object.fromEntries((f?.fields ?? []).filter((x) => x.type !== "calculated" && x.type !== "file" && x.type !== "signature" && (x.required || x.type !== "hidden")).map((x) => [x.key, x.sample])),
      meta: { utm: { source: "api-playground" } },
    }),
  },
  { id: "subs.get", group: "Submissions", method: "GET", path: "/submissions/{submissionId}", label: "Retrieve submission", scope: "submissions:read" },
  {
    id: "subs.update",
    group: "Submissions",
    method: "PATCH",
    path: "/submissions/{submissionId}",
    label: "Update submission",
    scope: "submissions:write",
    body: () => ({ status: "REVIEWED", tags: ["api", "playground"] }),
  },
  { id: "analytics", group: "Analytics", method: "GET", path: "/forms/{formId}/analytics?days=30", label: "Form analytics", scope: "analytics:read" },
  { id: "automations.list", group: "Automations", method: "GET", path: "/forms/{formId}/automations", label: "List automations", scope: "forms:read" },
  {
    id: "automations.trigger",
    group: "Automations",
    method: "POST",
    path: "/automations/{automationId}/trigger",
    label: "Trigger automation",
    scope: "automations:trigger",
    body: (f) => ({ ...(f?.submissionIds[0] ? { submissionId: f.submissionIds[0] } : {}), data: { source: "playground" } }),
  },
]

const METHOD_CLASS: Record<Method, string> = {
  GET: "text-sky-700 dark:text-sky-400",
  POST: "text-emerald-700 dark:text-emerald-400",
  PATCH: "text-amber-700 dark:text-amber-400",
  DELETE: "text-destructive",
}

function snippets(method: Method, url: string, body: string | null, idem: string | null) {
  const hasBody = body !== null && method !== "GET"
  const curl = [
    `curl -X ${method} '${url}'`,
    `  -H 'Authorization: Bearer $DF_API_KEY'`,
    ...(hasBody ? [`  -H 'Content-Type: application/json'`] : []),
    ...(idem ? [`  -H 'Idempotency-Key: ${idem}'`] : []),
    ...(hasBody ? [`  -d '${body!.replace(/'/g, "'\\''")}'`] : []),
  ].join(" \\\n")
  const ts = `const res = await fetch("${url}", {
  method: "${method}",
  headers: {
    Authorization: \`Bearer \${process.env.DF_API_KEY}\`,${hasBody ? `\n    "Content-Type": "application/json",` : ""}${idem ? `\n    "Idempotency-Key": "${idem}",` : ""}
  },${hasBody ? `\n  body: JSON.stringify(${body}),` : ""}
})
if (!res.ok) throw new Error((await res.json()).error.message)
const json = await res.json()`
  const py = `import os, requests

res = requests.${method.toLowerCase()}(
    "${url}",
    headers={
        "Authorization": f"Bearer {os.environ['DF_API_KEY']}",${idem ? `\n        "Idempotency-Key": "${idem}",` : ""}
    },${hasBody ? `\n    json=${body!.replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None")},` : ""}
    timeout=10,
)
res.raise_for_status()
print(res.json())`
  return { curl, ts, py }
}

export function Playground({ forms, baseUrl, apiKey, onApiKey }: { forms: PlaygroundForm[]; baseUrl: string; apiKey: string; onApiKey: (k: string) => void }) {
  const [endpointId, setEndpointId] = useState("subs.create")
  const [formId, setFormId] = useState(forms.find((f) => f.status === "PUBLISHED")?.id ?? forms[0]?.id ?? "")
  const form = forms.find((f) => f.id === formId)
  const endpoint = ENDPOINTS.find((e) => e.id === endpointId)!
  const [submissionId, setSubmissionId] = useState("")
  const [automationId, setAutomationId] = useState("")
  const [bodyOverride, setBodyOverride] = useState<Record<string, string>>({})
  const [useIdem, setUseIdem] = useState(true)
  const [idemKey, setIdemKey] = useState("")
  const [response, setResponse] = useState<{ status: number; ms: number; headers: Record<string, string>; body: unknown } | null>(null)
  const [sending, setSending] = useState(false)

  const effectiveSubmission = submissionId || form?.submissionIds[0] || ""
  const effectiveAutomation = automationId || form?.automations.find((a) => a.trigger === "MANUAL")?.id || form?.automations[0]?.id || ""
  const path = endpoint.path.replace("{formId}", formId || "{formId}").replace("{submissionId}", effectiveSubmission || "{submissionId}").replace("{automationId}", effectiveAutomation || "{automationId}")
  const url = `${baseUrl}/api/v1${path}`
  const overrideKey = `${endpointId}:${formId}`
  const defaultBody = useMemo(() => (endpoint.body ? JSON.stringify(endpoint.body(form), null, 2) : null), [endpoint, form])
  const body = endpoint.body ? (bodyOverride[overrideKey] ?? defaultBody) : null
  const idemOn = !!endpoint.idempotent && useIdem
  const code = snippets(endpoint.method, url, body ? JSON.stringify(JSON.parse(safeJson(body) ?? "null")) : null, idemOn ? idemKey || "<unique-key>" : null)

  const send = async () => {
    // Generated in the event handler (not during render) so SSR and hydration agree.
    const idem = idemOn ? idemKey || `pg-${Math.random().toString(36).slice(2, 10)}` : null
    if (idem && !idemKey) setIdemKey(idem)
    setSending(true)
    const t0 = performance.now()
    try {
      const res = await fetch(`/api/v1${path}`, {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(idem ? { "Idempotency-Key": idem } : {}),
        },
        body: body && endpoint.method !== "GET" ? body : undefined,
      })
      const text = await res.text()
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        /* keep text */
      }
      const headers: Record<string, string> = {}
      for (const h of ["x-request-id", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "idempotent-replayed", "retry-after", "x-response-time"]) {
        const v = res.headers.get(h)
        if (v) headers[h] = v
      }
      setResponse({ status: res.status, ms: Math.round(performance.now() - t0), headers, body: parsed })
    } catch (e) {
      setResponse({ status: 0, ms: Math.round(performance.now() - t0), headers: {}, body: { error: e instanceof Error ? e.message : "Network error" } })
    } finally {
      setSending(false)
    }
  }

  const groups = Array.from(new Set(ENDPOINTS.map((e) => e.group)))

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-5">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pg-key">API key</FieldLabel>
            <Input id="pg-key" type="password" autoComplete="off" className="font-mono text-xs" placeholder="fs_live_…" value={apiKey} onChange={(e) => onApiKey(e.target.value.trim())} />
            <FieldDescription>Kept in this tab only. Create a key in the Keys tab to auto-fill it.</FieldDescription>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="pg-endpoint">Endpoint</FieldLabel>
              <Select value={endpointId} onValueChange={(v) => (setEndpointId(v), setResponse(null))}>
                <SelectTrigger id="pg-endpoint" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectGroup key={g}>
                      <SelectLabel>{g}</SelectLabel>
                      {ENDPOINTS.filter((e) => e.group === g).map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          <span className={cn("w-12 font-mono text-[10px]", METHOD_CLASS[e.method])}>{e.method}</span> {e.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {endpoint.path.includes("{formId}") || endpoint.path.includes("{submissionId}") || endpoint.path.includes("{automationId}") ? (
              <Field>
                <FieldLabel htmlFor="pg-form">Form</FieldLabel>
                <Select value={formId} onValueChange={(v) => (setFormId(v), setSubmissionId(""), setAutomationId(""))}>
                  <SelectTrigger id="pg-form" className="w-full">
                    <SelectValue placeholder="Choose a form" />
                  </SelectTrigger>
                  <SelectContent>
                    {forms.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.title}
                        {f.status !== "PUBLISHED" && <span className="ml-1 text-xs text-muted-foreground">({f.status.toLowerCase()})</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
          {endpoint.path.includes("{submissionId}") && (
            <Field>
              <FieldLabel htmlFor="pg-sub">Submission</FieldLabel>
              <Select value={effectiveSubmission} onValueChange={setSubmissionId} disabled={!form?.submissionIds.length}>
                <SelectTrigger id="pg-sub" className="w-full font-mono text-xs">
                  <SelectValue placeholder="No submissions yet" />
                </SelectTrigger>
                <SelectContent>
                  {form?.submissionIds.map((id) => (
                    <SelectItem key={id} value={id} className="font-mono text-xs">
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {endpoint.path.includes("{automationId}") && (
            <Field>
              <FieldLabel htmlFor="pg-auto">Automation</FieldLabel>
              <Select value={effectiveAutomation} onValueChange={setAutomationId} disabled={!form?.automations.length}>
                <SelectTrigger id="pg-auto" className="w-full">
                  <SelectValue placeholder="No automations on this form" />
                </SelectTrigger>
                <SelectContent>
                  {form?.automations.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} <span className="text-xs text-muted-foreground">({a.trigger === "MANUAL" ? "manual" : "not manual"}{a.enabled ? "" : ", paused"})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
            <span className={cn("font-semibold", METHOD_CLASS[endpoint.method])}>{endpoint.method}</span>
            <span className="truncate">/api/v1{path}</span>
            {endpoint.scope && (
              <Badge variant="outline" className="ml-auto shrink-0 font-mono text-[10px] font-normal">
                {endpoint.scope}
              </Badge>
            )}
          </div>
          {body !== null && (
            <Field>
              <FieldLabel htmlFor="pg-body">Body {endpoint.id === "subs.create" && <span className="font-normal text-muted-foreground">— generated from this form&apos;s fields</span>}</FieldLabel>
              <Textarea id="pg-body" rows={10} className="font-mono text-xs" value={body} onChange={(e) => setBodyOverride((o) => ({ ...o, [overrideKey]: e.target.value }))} />
              {safeJson(body) === null && <p className="text-xs text-destructive">Body is not valid JSON.</p>}
            </Field>
          )}
          {endpoint.idempotent && (
            <div className="flex items-center gap-3">
              <Field orientation="horizontal" className="w-auto">
                <Switch id="pg-idem" checked={useIdem} onCheckedChange={setUseIdem} />
                <FieldLabel htmlFor="pg-idem" className="font-normal">
                  Idempotency-Key
                </FieldLabel>
              </Field>
              <Input aria-label="Idempotency key" className="h-8 max-w-48 font-mono text-xs" value={idemKey} placeholder="generated on send" disabled={!useIdem} onChange={(e) => setIdemKey(e.target.value)} />
              <Button variant="ghost" size="xs" disabled={!useIdem} onClick={() => setIdemKey(`pg-${Math.random().toString(36).slice(2, 10)}`)}>
                New key
              </Button>
            </div>
          )}
        </FieldGroup>
        <Button onClick={() => void send()} disabled={sending || !apiKey || (body !== null && safeJson(body) === null)}>
          {sending ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />} Send request
        </Button>
      </div>

      <div className="min-w-0 space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Response</h3>
            {response && (
              <span className="flex items-center gap-3 font-mono text-xs tabular-nums">
                <span className={response.status >= 200 && response.status < 300 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>{response.status || "ERR"}</span>
                <span className="text-muted-foreground">{response.ms}ms</span>
              </span>
            )}
          </div>
          {response ? (
            <div className="space-y-2">
              {Object.keys(response.headers).length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-md border px-3 py-2 font-mono text-[11px]">
                  {Object.entries(response.headers).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <pre className="max-h-[420px] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                {typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">Send a request to see the live response, status, latency and rate-limit headers.</p>
          )}
        </div>
        <Tabs defaultValue="curl">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="ts">TypeScript</TabsTrigger>
              <TabsTrigger value="py">Python</TabsTrigger>
            </TabsList>
          </div>
          {(["curl", "ts", "py"] as const).map((k) => (
            <TabsContent key={k} value={k} className="space-y-2">
              <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">{code[k]}</pre>
              <CopyButton value={code[k]} label="Copy snippet" />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}

function safeJson(s: string): string | null {
  try {
    JSON.parse(s)
    return s
  } catch {
    return null
  }
}
