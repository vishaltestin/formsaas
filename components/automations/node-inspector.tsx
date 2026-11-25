"use client"

import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  CONDITION_OPERATORS,
  TRIGGER_LABELS,
  type ApprovalConfig,
  type AutomationNodeData,
  type ChatConfig,
  type ConditionConfig,
  type ConditionOperator,
  type DelayConfig,
  type EmailConfig,
  type HttpConfig,
  type NodeType,
  type NotifyConfig,
  type TransformConfig,
  type TriggerConfig,
  type TriggerKind,
  type UpdateSubmissionConfig,
} from "@/lib/automations/types"
import type { VariableGroup } from "@/lib/automations/variables"

import { TemplateInput } from "./template-input"

type Patch = (config: Record<string, unknown>) => void

function NumberField({ id, value, onChange, min, max }: { id: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      className="font-mono tabular-nums"
      value={Number.isFinite(value) ? value : ""}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  )
}

function TriggerForm({ c, patch }: { c: TriggerConfig; patch: Patch }) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="tr-kind">Trigger</FieldLabel>
        <Select value={c.kind} onValueChange={(kind) => patch({ kind })}>
          <SelectTrigger id="tr-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TRIGGER_LABELS) as TriggerKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {TRIGGER_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          {c.kind === "MANUAL"
            ? "Runs when triggered from the API (POST /api/v1/automations/{id}/trigger) or replayed."
            : c.kind === "STATUS_CHANGED"
              ? "Runs when a submission's status is changed in the inbox or via the API."
              : c.kind === "QUIZ_SCORE"
                ? "Runs after a scored submission when the score matches the threshold."
                : "Runs after every valid submission."}
        </FieldDescription>
      </Field>
      {c.kind === "QUIZ_SCORE" && (
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor="tr-op">Score is</FieldLabel>
            <Select value={c.scoreOperator ?? "gte"} onValueChange={(scoreOperator) => patch({ scoreOperator })}>
              <SelectTrigger id="tr-op" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gte">at least (≥)</SelectItem>
                <SelectItem value="gt">above (&gt;)</SelectItem>
                <SelectItem value="equals">exactly (=)</SelectItem>
                <SelectItem value="lte">at most (≤)</SelectItem>
                <SelectItem value="lt">below (&lt;)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="tr-th">Threshold</FieldLabel>
            <NumberField id="tr-th" value={c.scoreThreshold ?? 0} onChange={(scoreThreshold) => patch({ scoreThreshold })} />
          </Field>
        </div>
      )}
      {c.kind === "STATUS_CHANGED" && (
        <Field>
          <FieldLabel htmlFor="tr-status">New status</FieldLabel>
          <Select value={c.toStatus || "ANY"} onValueChange={(v) => patch({ toStatus: v === "ANY" ? "" : v })}>
            <SelectTrigger id="tr-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Any status</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="REVIEWED">Reviewed</SelectItem>
              <SelectItem value="FLAGGED">Flagged</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
    </FieldGroup>
  )
}

function ConditionForm({ c, patch, groups }: { c: ConditionConfig; patch: Patch; groups: VariableGroup[] }) {
  const setRule = (i: number, r: Partial<ConditionConfig["rules"][number]>) => patch({ rules: c.rules.map((x, j) => (j === i ? { ...x, ...r } : x)) })
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="cd-match">Match</FieldLabel>
        <Select value={c.match} onValueChange={(match) => patch({ match })}>
          <SelectTrigger id="cd-match" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rules (AND)</SelectItem>
            <SelectItem value="any">Any rule (OR)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {c.rules.map((r, i) => {
        const unary = CONDITION_OPERATORS.find((o) => o.value === r.op)?.unary
        return (
          <div key={i} className="space-y-2 rounded-md border p-2.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">rule {i + 1}</span>
              <Button variant="ghost" size="icon-xs" aria-label="Remove rule" disabled={c.rules.length === 1} onClick={() => patch({ rules: c.rules.filter((_, j) => j !== i) })}>
                <Trash2Icon />
              </Button>
            </div>
            <TemplateInput value={r.left} onChange={(left) => setRule(i, { left })} groups={groups} placeholder="{{trigger.data.email}}" mono />
            <Select value={r.op} onValueChange={(op) => setRule(i, { op: op as ConditionOperator })}>
              <SelectTrigger className="w-full" aria-label="Operator">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_OPERATORS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!unary && <TemplateInput value={r.right ?? ""} onChange={(right) => setRule(i, { right })} groups={groups} placeholder="Value" />}
          </div>
        )
      })}
      <Button variant="outline" size="sm" onClick={() => patch({ rules: [...c.rules, { left: "", op: "equals", right: "" }] })}>
        <PlusIcon data-icon="inline-start" /> Add rule
      </Button>
      <FieldDescription>Connect the green “true” handle and the red “false” handle to route each outcome.</FieldDescription>
    </FieldGroup>
  )
}

function TransformForm({ c, patch, groups }: { c: TransformConfig; patch: Patch; groups: VariableGroup[] }) {
  const set = (i: number, m: Partial<TransformConfig["mappings"][number]>) => patch({ mappings: c.mappings.map((x, j) => (j === i ? { ...x, ...m } : x)) })
  return (
    <FieldGroup>
      {c.mappings.map((m, i) => (
        <div key={i} className="space-y-2 rounded-md border p-2.5">
          <div className="flex gap-2">
            <Input aria-label="Output key" className="font-mono text-xs" value={m.key} placeholder="key" onChange={(e) => set(i, { key: e.target.value })} />
            <Select value={m.type} onValueChange={(type) => set(i, { type: type as TransformConfig["mappings"][number]["type"] })}>
              <SelectTrigger className="w-28" aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">string</SelectItem>
                <SelectItem value="number">number</SelectItem>
                <SelectItem value="boolean">boolean</SelectItem>
                <SelectItem value="json">json</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon-sm" aria-label="Remove mapping" disabled={c.mappings.length === 1} onClick={() => patch({ mappings: c.mappings.filter((_, j) => j !== i) })}>
              <Trash2Icon />
            </Button>
          </div>
          <TemplateInput value={m.value} onChange={(value) => set(i, { value })} groups={groups} placeholder="{{trigger.data.name}}" mono multiline={m.type === "json"} rows={3} />
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => patch({ mappings: [...c.mappings, { key: `field${c.mappings.length + 1}`, value: "", type: "string" }] })}>
        <PlusIcon data-icon="inline-start" /> Add mapping
      </Button>
      <FieldDescription>Each key becomes available downstream as {"{{nodes.<id>.<key>}}"}.</FieldDescription>
    </FieldGroup>
  )
}

function KeyValueList({ items, onChange, groups }: { items: { key: string; value: string }[]; onChange: (v: { key: string; value: string }[]) => void; groups: VariableGroup[] }) {
  return (
    <div className="space-y-2">
      {items.map((h, i) => (
        <div key={i} className="flex gap-2">
          <Input aria-label="Header name" className="w-36 font-mono text-xs" value={h.key} placeholder="X-Header" onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
          <div className="min-w-0 flex-1">
            <TemplateInput value={h.value} onChange={(value) => onChange(items.map((x, j) => (j === i ? { ...x, value } : x)))} groups={groups} mono />
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Remove header" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...items, { key: "", value: "" }])}>
        <PlusIcon data-icon="inline-start" /> Add header
      </Button>
    </div>
  )
}

function HttpForm({ c, patch, groups }: { c: HttpConfig; patch: Patch; groups: VariableGroup[] }) {
  return (
    <FieldGroup>
      <div className="flex gap-2">
        <Select value={c.method} onValueChange={(method) => patch({ method })}>
          <SelectTrigger className="w-28 font-mono" aria-label="Method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <SelectItem key={m} value={m} className="font-mono">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="min-w-0 flex-1">
          <TemplateInput value={c.url} onChange={(url) => patch({ url })} groups={groups} placeholder="https://api.example.com/leads" mono />
        </div>
      </div>
      <Field>
        <FieldLabel>Headers</FieldLabel>
        <KeyValueList items={c.headers} onChange={(headers) => patch({ headers })} groups={groups} />
      </Field>
      {!["GET", "DELETE"].includes(c.method) && (
        <Field>
          <FieldLabel htmlFor="http-body">Body</FieldLabel>
          <TemplateInput id="http-body" value={c.body} onChange={(body) => patch({ body })} groups={groups} multiline rows={7} mono />
          <FieldDescription>Variables inside JSON strings are escaped automatically; bare variables become JSON values.</FieldDescription>
        </Field>
      )}
      <FieldSeparator />
      <Field>
        <FieldLabel htmlFor="http-auth">Authentication</FieldLabel>
        <Select value={c.auth} onValueChange={(auth) => patch({ auth })}>
          <SelectTrigger id="http-auth" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="bearer">Bearer token</SelectItem>
            <SelectItem value="basic">Basic auth</SelectItem>
            <SelectItem value="header">API key header</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {c.auth === "header" && (
        <Field>
          <FieldLabel htmlFor="http-hn">Header name</FieldLabel>
          <Input id="http-hn" className="font-mono text-xs" value={c.authHeaderName ?? ""} placeholder="X-API-Key" onChange={(e) => patch({ authHeaderName: e.target.value })} />
        </Field>
      )}
      {(c.auth === "bearer" || c.auth === "header") && (
        <Field>
          <FieldLabel htmlFor="http-token">{c.auth === "bearer" ? "Token" : "Key"}</FieldLabel>
          <Input id="http-token" type="password" autoComplete="off" className="font-mono text-xs" value={c.authToken ?? ""} onChange={(e) => patch({ authToken: e.target.value })} />
        </Field>
      )}
      {c.auth === "basic" && (
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor="http-user">Username</FieldLabel>
            <Input id="http-user" value={c.authUser ?? ""} onChange={(e) => patch({ authUser: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="http-pass">Password</FieldLabel>
            <Input id="http-pass" type="password" autoComplete="off" value={c.authPassword ?? ""} onChange={(e) => patch({ authPassword: e.target.value })} />
          </Field>
        </div>
      )}
      <Field>
        <FieldLabel htmlFor="http-hmac">HMAC signing secret</FieldLabel>
        <Input id="http-hmac" type="password" autoComplete="off" className="font-mono text-xs" value={c.hmacSecret ?? ""} placeholder="Optional" onChange={(e) => patch({ hmacSecret: e.target.value })} />
        <FieldDescription>
          Adds <code className="font-mono">X-FormStudio-Signature: t=…,v1=HMAC-SHA256(t.body)</code>.
        </FieldDescription>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel htmlFor="http-retries">Retries</FieldLabel>
          <NumberField id="http-retries" value={c.retries} min={0} max={5} onChange={(retries) => patch({ retries: Math.max(0, Math.min(5, Math.round(retries))) })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="http-timeout">Timeout (ms)</FieldLabel>
          <NumberField id="http-timeout" value={c.timeoutMs} min={500} max={30000} onChange={(timeoutMs) => patch({ timeoutMs })} />
        </Field>
      </div>
      <Field orientation="horizontal">
        <Switch id="http-fail" checked={c.failOnHttpError} onCheckedChange={(failOnHttpError) => patch({ failOnHttpError })} />
        <FieldLabel htmlFor="http-fail" className="font-normal">
          Fail the step on non-2xx responses
        </FieldLabel>
      </Field>
      <FieldDescription>
        Retries use exponential backoff on network errors, 5xx and 429. Response is available as {"{{nodes.<id>.status}}"} and {"{{nodes.<id>.body.…}}"}.
      </FieldDescription>
    </FieldGroup>
  )
}

function EmailForm({ c, patch, groups }: { c: EmailConfig; patch: Patch; groups: VariableGroup[] }) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="em-to">To</FieldLabel>
        <TemplateInput id="em-to" value={c.to} onChange={(to) => patch({ to })} groups={groups} placeholder="{{trigger.data.email}}, team@acme.com" />
      </Field>
      <Field>
        <FieldLabel htmlFor="em-subject">Subject</FieldLabel>
        <TemplateInput id="em-subject" value={c.subject} onChange={(subject) => patch({ subject })} groups={groups} />
      </Field>
      <Field>
        <FieldLabel htmlFor="em-body">Message</FieldLabel>
        <TemplateInput id="em-body" value={c.body} onChange={(body) => patch({ body })} groups={groups} multiline rows={6} />
      </Field>
      <Field>
        <FieldLabel htmlFor="em-reply">Reply-to</FieldLabel>
        <TemplateInput id="em-reply" value={c.replyTo ?? ""} onChange={(replyTo) => patch({ replyTo })} groups={groups} placeholder="Optional" />
        <FieldDescription>Delivered through the email outbox (Brevo, Mailtrap or SMTP when configured, otherwise logged).</FieldDescription>
      </Field>
    </FieldGroup>
  )
}

function UpdateForm({ c, patch, groups }: { c: UpdateSubmissionConfig; patch: Patch; groups: VariableGroup[] }) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="up-status">Set status</FieldLabel>
        <Select value={c.status || "KEEP"} onValueChange={(v) => patch({ status: v === "KEEP" ? "" : v })}>
          <SelectTrigger id="up-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="KEEP">Keep current</SelectItem>
            <SelectItem value="NEW">New</SelectItem>
            <SelectItem value="REVIEWED">Reviewed</SelectItem>
            <SelectItem value="FLAGGED">Flagged</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="up-add">Add tags</FieldLabel>
        <TemplateInput id="up-add" value={c.addTags} onChange={(addTags) => patch({ addTags })} groups={groups} placeholder="vip, synced" />
      </Field>
      <Field>
        <FieldLabel htmlFor="up-rm">Remove tags</FieldLabel>
        <TemplateInput id="up-rm" value={c.removeTags} onChange={(removeTags) => patch({ removeTags })} groups={groups} placeholder="pending" />
      </Field>
      <Field>
        <FieldLabel htmlFor="up-note">Note</FieldLabel>
        <TemplateInput id="up-note" value={c.note} onChange={(note) => patch({ note })} groups={groups} multiline rows={3} />
      </Field>
      <Field>
        <FieldLabel htmlFor="up-mode">Note mode</FieldLabel>
        <Select value={c.noteMode} onValueChange={(noteMode) => patch({ noteMode })}>
          <SelectTrigger id="up-mode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="append">Append (timestamped)</SelectItem>
            <SelectItem value="replace">Replace</SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>Test runs never modify submissions — they report what would change.</FieldDescription>
      </Field>
    </FieldGroup>
  )
}

export function NodeInspector({
  nodeId,
  type,
  data,
  groups,
  onChange,
}: {
  nodeId: string
  type: NodeType
  data: AutomationNodeData
  groups: VariableGroup[]
  onChange: (data: AutomationNodeData) => void
}) {
  const patch: Patch = (config) => onChange({ ...data, config: { ...(data.config as object), ...config } as never })
  const c = data.config as never
  return (
    <FieldGroup className="gap-5">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field>
          <FieldLabel htmlFor="node-label">Step name</FieldLabel>
          <Input id="node-label" value={data.label} maxLength={80} onChange={(e) => onChange({ ...data, label: e.target.value })} />
        </Field>
        <code className="mb-2 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{nodeId}</code>
      </div>
      {type === "trigger" && <TriggerForm c={c as TriggerConfig} patch={patch} />}
      {type === "condition" && <ConditionForm c={c as ConditionConfig} patch={patch} groups={groups} />}
      {type === "transform" && <TransformForm c={c as TransformConfig} patch={patch} groups={groups} />}
      {type === "delay" && (
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor="dl-amt">Wait</FieldLabel>
            <NumberField id="dl-amt" value={(c as DelayConfig).amount} min={1} onChange={(amount) => patch({ amount })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="dl-unit">Unit</FieldLabel>
            <Select value={(c as DelayConfig).unit} onValueChange={(unit) => patch({ unit })}>
              <SelectTrigger id="dl-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seconds">seconds</SelectItem>
                <SelectItem value="minutes">minutes</SelectItem>
                <SelectItem value="hours">hours</SelectItem>
                <SelectItem value="days">days</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <FieldDescription className="col-span-2">The run pauses as “waiting” and resumes automatically. Test runs skip the wait.</FieldDescription>
        </div>
      )}
      {type === "approval" && (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ap-rev">Reviewer emails</FieldLabel>
            <TemplateInput id="ap-rev" value={(c as ApprovalConfig).reviewers} onChange={(reviewers) => patch({ reviewers })} groups={groups} placeholder="lead@acme.com, ops@acme.com" />
            <FieldDescription>Each reviewer gets a signed link to approve or reject — no account needed.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="ap-msg">Message</FieldLabel>
            <TemplateInput id="ap-msg" value={(c as ApprovalConfig).message} onChange={(message) => patch({ message })} groups={groups} multiline rows={3} />
          </Field>
          <Field orientation="horizontal">
            <Switch id="ap-owner" checked={(c as ApprovalConfig).notifyOwner} onCheckedChange={(notifyOwner) => patch({ notifyOwner })} />
            <FieldLabel htmlFor="ap-owner" className="font-normal">
              Also notify me in-app
            </FieldLabel>
          </Field>
          <FieldDescription>Connect the “approved” and “rejected” handles. Decisions are available as {"{{nodes.<id>.decision}}"}.</FieldDescription>
        </FieldGroup>
      )}
      {type === "http" && <HttpForm c={c as HttpConfig} patch={patch} groups={groups} />}
      {type === "email" && <EmailForm c={c as EmailConfig} patch={patch} groups={groups} />}
      {type === "update_submission" && <UpdateForm c={c as UpdateSubmissionConfig} patch={patch} groups={groups} />}
      {type === "chat" && (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ch-prov">Provider</FieldLabel>
            <Select value={(c as ChatConfig).provider} onValueChange={(provider) => patch({ provider })}>
              <SelectTrigger id="ch-prov" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="discord">Discord</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="ch-url">Incoming webhook URL</FieldLabel>
            <Input id="ch-url" className="font-mono text-xs" value={(c as ChatConfig).webhookUrl} onChange={(e) => patch({ webhookUrl: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ch-text">Message</FieldLabel>
            <TemplateInput id="ch-text" value={(c as ChatConfig).text} onChange={(text) => patch({ text })} groups={groups} multiline rows={4} />
          </Field>
        </FieldGroup>
      )}
      {type === "notify" && (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="nt-title">Title</FieldLabel>
            <TemplateInput id="nt-title" value={(c as NotifyConfig).title} onChange={(title) => patch({ title })} groups={groups} />
          </Field>
          <Field>
            <FieldLabel htmlFor="nt-body">Body</FieldLabel>
            <TemplateInput id="nt-body" value={(c as NotifyConfig).body} onChange={(body) => patch({ body })} groups={groups} multiline rows={3} />
          </Field>
          <Field>
            <FieldLabel htmlFor="nt-href">Link (app path)</FieldLabel>
            <TemplateInput id="nt-href" value={(c as NotifyConfig).href} onChange={(href) => patch({ href })} groups={groups} placeholder="/dashboard/forms/…" mono />
            <FieldDescription>Leave empty to link to this run.</FieldDescription>
          </Field>
        </FieldGroup>
      )}
      {type !== "trigger" && (
        <Field orientation="horizontal">
          <Switch id="node-coe" checked={!!data.continueOnError} onCheckedChange={(continueOnError) => onChange({ ...data, continueOnError })} />
          <FieldLabel htmlFor="node-coe" className="font-normal">
            Continue the run if this step fails
          </FieldLabel>
        </Field>
      )}
    </FieldGroup>
  )
}
