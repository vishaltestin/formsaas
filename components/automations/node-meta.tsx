import {
  BellIcon,
  GlobeIcon,
  MailIcon,
  MessageSquareIcon,
  PencilLineIcon,
  ShuffleIcon,
  SplitIcon,
  TimerIcon,
  UserCheckIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

import {
  TRIGGER_LABELS,
  type AutomationNode,
  type ChatConfig,
  type ConditionConfig,
  type DelayConfig,
  type EmailConfig,
  type HttpConfig,
  type NodeType,
  type TransformConfig,
  type TriggerConfig,
  type UpdateSubmissionConfig,
} from "@/lib/automations/types"

export const NODE_ICONS: Record<NodeType, LucideIcon> = {
  trigger: ZapIcon,
  condition: SplitIcon,
  transform: ShuffleIcon,
  delay: TimerIcon,
  approval: UserCheckIcon,
  http: GlobeIcon,
  email: MailIcon,
  update_submission: PencilLineIcon,
  chat: MessageSquareIcon,
  notify: BellIcon,
}

export function nodeSummary(node: AutomationNode): string {
  const c = node.data.config as unknown
  switch (node.type) {
    case "trigger": {
      const t = c as TriggerConfig
      if (t.kind === "QUIZ_SCORE") return `Score ${({ gte: "≥", gt: ">", lte: "≤", lt: "<", equals: "=" } as const)[t.scoreOperator ?? "gte"]} ${t.scoreThreshold ?? 0}`
      if (t.kind === "STATUS_CHANGED") return t.toStatus ? `Status → ${t.toStatus.toLowerCase()}` : "Any status change"
      return TRIGGER_LABELS[t.kind]
    }
    case "condition": {
      const cc = c as ConditionConfig
      return `${cc.rules.length} rule${cc.rules.length === 1 ? "" : "s"} · match ${cc.match}`
    }
    case "transform":
      return `${(c as TransformConfig).mappings.length} field(s)`
    case "delay": {
      const d = c as DelayConfig
      return `Wait ${d.amount} ${d.unit}`
    }
    case "approval":
      return "Waits for approve / reject"
    case "http": {
      const h = c as HttpConfig
      return `${h.method} ${h.url.replace(/^https?:\/\//, "")}`
    }
    case "email":
      return `To ${(c as EmailConfig).to}`
    case "update_submission": {
      const u = c as UpdateSubmissionConfig
      return [u.status && `→ ${u.status.toLowerCase()}`, u.addTags && `+${u.addTags}`, u.note && "note"].filter(Boolean).join(" · ") || "No changes"
    }
    case "chat":
      return (c as ChatConfig).provider === "discord" ? "Discord message" : "Slack message"
    case "notify":
      return "Notify form owner"
  }
}
