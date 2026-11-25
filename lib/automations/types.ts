/**
 * Automation graph model — shared by the React Flow studio (client), the
 * validator, the runner (server) and the tests. Pure types + constants only.
 */

export type TriggerKind = "FORM_SUBMITTED" | "QUIZ_SCORE" | "STATUS_CHANGED" | "MANUAL"

export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  FORM_SUBMITTED: "Form submitted",
  QUIZ_SCORE: "Quiz score threshold",
  STATUS_CHANGED: "Submission status changed",
  MANUAL: "Manual / API",
}

export type NodeType = "trigger" | "condition" | "transform" | "delay" | "approval" | "http" | "email" | "update_submission" | "chat" | "notify"

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_empty"
  | "is_not_empty"
  | "is_true"
  | "is_false"

export const CONDITION_OPERATORS: { value: ConditionOperator; label: string; unary?: boolean }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "is_empty", label: "is empty", unary: true },
  { value: "is_not_empty", label: "is not empty", unary: true },
  { value: "is_true", label: "is true", unary: true },
  { value: "is_false", label: "is false", unary: true },
]

export interface ConditionRule {
  left: string
  op: ConditionOperator
  right?: string
}

export interface KeyValue {
  key: string
  value: string
}

export interface TriggerConfig {
  kind: TriggerKind
  /** QUIZ_SCORE */
  scoreOperator?: "gte" | "gt" | "lte" | "lt" | "equals"
  scoreThreshold?: number
  /** STATUS_CHANGED: only fire when the new status matches ("" = any) */
  toStatus?: string
}

export interface ConditionConfig {
  match: "all" | "any"
  rules: ConditionRule[]
}

export interface TransformConfig {
  mappings: (KeyValue & { type: "string" | "number" | "boolean" | "json" })[]
}

export interface DelayConfig {
  amount: number
  unit: "seconds" | "minutes" | "hours" | "days"
}

export interface ApprovalConfig {
  reviewers: string
  message: string
  notifyOwner: boolean
}

export interface HttpConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  url: string
  headers: KeyValue[]
  body: string
  auth: "none" | "bearer" | "basic" | "header"
  authToken?: string
  authUser?: string
  authPassword?: string
  authHeaderName?: string
  hmacSecret?: string
  retries: number
  timeoutMs: number
  failOnHttpError: boolean
}

export interface EmailConfig {
  to: string
  subject: string
  body: string
  replyTo?: string
}

export interface UpdateSubmissionConfig {
  status?: "" | "NEW" | "REVIEWED" | "FLAGGED" | "ARCHIVED"
  addTags: string
  removeTags: string
  note: string
  noteMode: "append" | "replace"
}

export interface ChatConfig {
  provider: "slack" | "discord"
  webhookUrl: string
  text: string
}

export interface NotifyConfig {
  title: string
  body: string
  href: string
}

export interface NodeConfigMap {
  trigger: TriggerConfig
  condition: ConditionConfig
  transform: TransformConfig
  delay: DelayConfig
  approval: ApprovalConfig
  http: HttpConfig
  email: EmailConfig
  update_submission: UpdateSubmissionConfig
  chat: ChatConfig
  notify: NotifyConfig
}

export interface AutomationNodeData<T extends NodeType = NodeType> {
  label: string
  config: NodeConfigMap[T]
  /** When true a failing node does not fail the run */
  continueOnError?: boolean
  [key: string]: unknown
}

export interface AutomationNode<T extends NodeType = NodeType> {
  id: string
  type: T
  position: { x: number; y: number }
  data: AutomationNodeData<T>
}

export interface AutomationEdge {
  id: string
  source: string
  target: string
  /** Branch handle for condition ("true" | "false") and approval ("approved" | "rejected") nodes */
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface AutomationGraph {
  nodes: AutomationNode[]
  edges: AutomationEdge[]
}

export const BRANCH_HANDLES: Partial<Record<NodeType, string[]>> = {
  condition: ["true", "false"],
  approval: ["approved", "rejected"],
}

export const NODE_CATALOG: { type: NodeType; label: string; group: "Trigger" | "Logic" | "Action"; description: string }[] = [
  { type: "trigger", label: "Trigger", group: "Trigger", description: "Starts the automation" },
  { type: "condition", label: "If / else", group: "Logic", description: "Route on conditions" },
  { type: "transform", label: "Transform", group: "Logic", description: "Map and reshape data" },
  { type: "delay", label: "Delay", group: "Logic", description: "Wait before continuing" },
  { type: "approval", label: "Approval gate", group: "Logic", description: "Pause for a human decision" },
  { type: "http", label: "HTTP request", group: "Action", description: "Call any API or webhook" },
  { type: "email", label: "Send email", group: "Action", description: "Email via the outbox" },
  { type: "update_submission", label: "Update submission", group: "Action", description: "Status, tags and notes" },
  { type: "chat", label: "Slack / Discord", group: "Action", description: "Post a chat message" },
  { type: "notify", label: "In-app notification", group: "Action", description: "Notify the form owner" },
]

export const NODE_ID_PREFIX: Record<NodeType, string> = {
  trigger: "trigger",
  condition: "if",
  transform: "map",
  delay: "delay",
  approval: "approval",
  http: "http",
  email: "email",
  update_submission: "update",
  chat: "chat",
  notify: "notify",
}

export function defaultNodeConfig<T extends NodeType>(type: T): NodeConfigMap[T] {
  const configs: NodeConfigMap = {
    trigger: { kind: "FORM_SUBMITTED", scoreOperator: "gte", scoreThreshold: 5, toStatus: "" },
    condition: { match: "all", rules: [{ left: "{{trigger.data.email}}", op: "is_not_empty", right: "" }] },
    transform: { mappings: [{ key: "fullName", value: "{{trigger.data.name}}", type: "string" }] },
    delay: { amount: 5, unit: "minutes" },
    approval: { reviewers: "", message: "Please review this submission.", notifyOwner: true },
    http: {
      method: "POST",
      url: "https://",
      headers: [],
      body: '{\n  "submissionId": "{{trigger.submission.id}}",\n  "data": {{trigger.data}}\n}',
      auth: "none",
      retries: 2,
      timeoutMs: 10000,
      failOnHttpError: true,
    },
    email: { to: "{{trigger.data.email}}", subject: "Thanks, we received your response", body: "Hi,\n\nThanks for reaching out — we'll be in touch shortly." },
    update_submission: { status: "REVIEWED", addTags: "", removeTags: "", note: "", noteMode: "append" },
    chat: { provider: "slack", webhookUrl: "https://hooks.slack.com/services/", text: "New response on {{trigger.form.title}}" },
    notify: { title: "New response on {{trigger.form.title}}", body: "", href: "" },
  }
  return structuredClone(configs[type])
}

/** Output keys each node exposes to downstream templates (for the variable picker). */
export const NODE_OUTPUT_HINTS: Record<NodeType, string[]> = {
  trigger: [],
  condition: ["result"],
  transform: [],
  delay: ["waitedMs", "resumedAt"],
  approval: ["decision", "reviewer", "comment", "decidedAt"],
  http: ["status", "ok", "body", "headers", "durationMs"],
  email: ["outboxId", "to", "status"],
  update_submission: ["status", "tags", "notes"],
  chat: ["status", "ok"],
  notify: ["notificationId"],
}

export type StepStatus = "SUCCEEDED" | "FAILED" | "SKIPPED" | "WAITING"
