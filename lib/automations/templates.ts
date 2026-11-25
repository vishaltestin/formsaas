import { defaultNodeConfig, type AutomationGraph, type TriggerKind } from "./types"

export const AUTOMATION_TEMPLATES: { id: string; name: string; description: string; build: () => AutomationGraph }[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Start from a trigger only.",
    build: () => ({
      nodes: [{ id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Form submitted", config: defaultNodeConfig("trigger") } }],
      edges: [],
    }),
  },
  {
    id: "lead-routing",
    name: "Lead routing with approval",
    description: "Route high-value leads to an approval gate, then sync to your CRM.",
    build: () => ({
      nodes: [
        { id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Form submitted", config: defaultNodeConfig("trigger") } },
        {
          id: "if_1",
          type: "condition",
          position: { x: 0, y: 170 },
          data: { label: "Has email?", config: { match: "all", rules: [{ left: "{{trigger.data.email}}", op: "is_not_empty", right: "" }] } },
        },
        {
          id: "approval_1",
          type: "approval",
          position: { x: -220, y: 360 },
          data: { label: "Sales approval", config: { ...defaultNodeConfig("approval"), message: "New lead from {{trigger.data.email}} — approve to sync to CRM." } },
        },
        {
          id: "update_1",
          type: "update_submission",
          position: { x: 220, y: 360 },
          data: { label: "Flag incomplete", config: { status: "FLAGGED", addTags: "no-email", removeTags: "", note: "Missing email address", noteMode: "append" } },
        },
        {
          id: "notify_1",
          type: "notify",
          position: { x: -220, y: 550 },
          data: { label: "Notify owner", config: { title: "Lead approved: {{trigger.data.email}}", body: "Reviewed by {{nodes.approval_1.reviewer}}", href: "" } },
        },
      ],
      edges: [
        { id: "e1", source: "trigger_1", target: "if_1" },
        { id: "e2", source: "if_1", target: "approval_1", sourceHandle: "true" },
        { id: "e3", source: "if_1", target: "update_1", sourceHandle: "false" },
        { id: "e4", source: "approval_1", target: "notify_1", sourceHandle: "approved" },
      ],
    }),
  },
  {
    id: "webhook-sync",
    name: "Sync to an API",
    description: "POST every response to an endpoint and tag the submission with the result.",
    build: () => ({
      nodes: [
        { id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Form submitted", config: defaultNodeConfig("trigger") } },
        { id: "http_1", type: "http", position: { x: 0, y: 170 }, data: { label: "POST to API", config: { ...defaultNodeConfig("http"), url: "https://httpbin.org/post" } } },
        {
          id: "update_1",
          type: "update_submission",
          position: { x: 0, y: 340 },
          data: { label: "Tag as synced", config: { status: "", addTags: "synced", removeTags: "", note: "Synced (HTTP {{nodes.http_1.status}})", noteMode: "append" } },
        },
      ],
      edges: [
        { id: "e1", source: "trigger_1", target: "http_1" },
        { id: "e2", source: "http_1", target: "update_1" },
      ],
    }),
  },
]

export function triggerLabel(kind: TriggerKind) {
  return { FORM_SUBMITTED: "Form submitted", QUIZ_SCORE: "Quiz score threshold", STATUS_CHANGED: "Status changed", MANUAL: "Manual / API" }[kind]
}
