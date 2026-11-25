import { ancestorsOf } from "./graph"
import { NODE_OUTPUT_HINTS, type AutomationGraph, type TransformConfig } from "./types"

export interface VariableItem {
  path: string
  label: string
}
export interface VariableGroup {
  group: string
  items: VariableItem[]
}

/** Variables available to `nodeId`: trigger payload + outputs of upstream steps only. */
export function availableVariables(graph: AutomationGraph, nodeId: string | null, fields: { key: string; label: string }[]): VariableGroup[] {
  const trigger = graph.nodes.find((n) => n.type === "trigger")
  const kind = trigger?.type === "trigger" ? (trigger.data.config as { kind?: string }).kind : "FORM_SUBMITTED"
  const groups: VariableGroup[] = [
    { group: "Answers", items: [{ path: "trigger.data", label: "All answers (JSON)" }, ...fields.map((f) => ({ path: `trigger.data.${f.key}`, label: f.label }))] },
    {
      group: "Submission",
      items: [
        { path: "trigger.submission.id", label: "Submission ID" },
        { path: "trigger.submission.status", label: "Status" },
        { path: "trigger.submission.url", label: "Dashboard link" },
        { path: "trigger.submission.createdAt", label: "Submitted at" },
        { path: "trigger.submission.tags", label: "Tags" },
        { path: "trigger.score", label: "Score" },
        ...(kind === "STATUS_CHANGED" ? [{ path: "trigger.previousStatus", label: "Previous status" }] : []),
      ],
    },
    {
      group: "Form",
      items: [
        { path: "trigger.form.title", label: "Form title" },
        { path: "trigger.form.id", label: "Form ID" },
        { path: "trigger.form.slug", label: "Form slug" },
        { path: "trigger.event", label: "Event name" },
        { path: "run.id", label: "Run ID" },
      ],
    },
  ]
  if (!nodeId) return groups
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  for (const id of ancestorsOf(graph, nodeId)) {
    const n = byId.get(id)
    if (!n || n.type === "trigger") continue
    const hints =
      n.type === "transform"
        ? ((n.data.config as TransformConfig).mappings ?? []).map((m) => m.key).filter(Boolean)
        : n.type === "http"
          ? [...NODE_OUTPUT_HINTS.http, "body.id"]
          : NODE_OUTPUT_HINTS[n.type]
    if (hints.length === 0) continue
    groups.push({ group: `${n.data.label} · ${n.id}`, items: hints.map((h) => ({ path: `nodes.${n.id}.${h}`, label: h })) })
  }
  return groups
}
