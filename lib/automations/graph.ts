import {
  BRANCH_HANDLES,
  defaultNodeConfig,
  NODE_CATALOG,
  type AutomationEdge,
  type AutomationGraph,
  type AutomationNode,
  type NodeType,
  type TriggerKind,
} from "./types"

const NODE_TYPES = new Set<NodeType>(NODE_CATALOG.map((n) => n.type))
const TRIGGER_KINDS = new Set<TriggerKind>(["FORM_SUBMITTED", "QUIZ_SCORE", "STATUS_CHANGED", "MANUAL"])

export interface GraphIssue {
  nodeId?: string
  edgeId?: string
  message: string
  severity: "error" | "warning"
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

/** Coerces untrusted JSON (DB / client) into a structurally valid graph. */
export function normalizeGraph(raw: unknown): AutomationGraph {
  if (!isObject(raw)) return { nodes: [], edges: [] }
  const nodes: AutomationNode[] = []
  const seen = new Set<string>()
  for (const n of Array.isArray(raw.nodes) ? raw.nodes : []) {
    if (!isObject(n) || typeof n.id !== "string" || !NODE_TYPES.has(n.type as NodeType) || seen.has(n.id)) continue
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(n.id)) continue
    seen.add(n.id)
    const type = n.type as NodeType
    const data = isObject(n.data) ? n.data : {}
    const pos = isObject(n.position) ? n.position : {}
    nodes.push({
      id: n.id,
      type,
      position: { x: Number(pos.x) || 0, y: Number(pos.y) || 0 },
      data: {
        label: typeof data.label === "string" && data.label.trim() ? data.label.slice(0, 80) : (NODE_CATALOG.find((c) => c.type === type)?.label ?? type),
        config: { ...(defaultNodeConfig(type) as object), ...(isObject(data.config) ? data.config : {}) } as never,
        continueOnError: data.continueOnError === true,
      },
    })
  }
  const edges: AutomationEdge[] = []
  const edgeKeys = new Set<string>()
  for (const e of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!isObject(e) || typeof e.source !== "string" || typeof e.target !== "string") continue
    if (!seen.has(e.source) || !seen.has(e.target)) continue
    const sourceHandle = typeof e.sourceHandle === "string" && e.sourceHandle ? e.sourceHandle : null
    const key = `${e.source}:${sourceHandle ?? ""}->${e.target}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    edges.push({ id: typeof e.id === "string" ? e.id : key, source: e.source, target: e.target, sourceHandle, targetHandle: null })
  }
  return { nodes, edges }
}

/** Returns node ids in a cycle, or null when the graph is acyclic (Kahn's algorithm). */
export function findCycle(graph: AutomationGraph): string[] | null {
  const indeg = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]))
  const out = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]))
  for (const e of graph.edges) {
    if (!indeg.has(e.source) || !indeg.has(e.target)) continue
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
    out.get(e.source)!.push(e.target)
  }
  const queue = [...indeg].filter(([, d]) => d === 0).map(([id]) => id)
  let visited = 0
  while (queue.length) {
    const id = queue.shift()!
    visited++
    for (const t of out.get(id) ?? []) {
      indeg.set(t, indeg.get(t)! - 1)
      if (indeg.get(t) === 0) queue.push(t)
    }
  }
  if (visited === graph.nodes.length) return null
  return [...indeg].filter(([, d]) => d > 0).map(([id]) => id)
}

/** Would adding source→target create a cycle? (used to reject connections live in the editor) */
export function wouldCreateCycle(graph: AutomationGraph, source: string, target: string) {
  if (source === target) return true
  const out = new Map<string, string[]>()
  for (const e of graph.edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target])
  const stack = [target]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === source) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(out.get(id) ?? []))
  }
  return false
}

export function topologicalOrder(graph: AutomationGraph): string[] {
  const indeg = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]))
  for (const e of graph.edges) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  const queue = graph.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const e of graph.edges.filter((x) => x.source === id)) {
      indeg.set(e.target, indeg.get(e.target)! - 1)
      if (indeg.get(e.target) === 0) queue.push(e.target)
    }
  }
  return order
}

/** Upstream node ids of `nodeId` (for the variable picker: only ancestors can be referenced). */
export function ancestorsOf(graph: AutomationGraph, nodeId: string): string[] {
  const incoming = new Map<string, string[]>()
  for (const e of graph.edges) incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source])
  const result = new Set<string>()
  const stack = [...(incoming.get(nodeId) ?? [])]
  while (stack.length) {
    const id = stack.pop()!
    if (result.has(id)) continue
    result.add(id)
    stack.push(...(incoming.get(id) ?? []))
  }
  return topologicalOrder(graph).filter((id) => result.has(id))
}

const NODE_REF = /\{\{\s*nodes\.([a-zA-Z0-9_-]+)/g

function templateStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value)
  else if (Array.isArray(value)) value.forEach((v) => templateStrings(v, out))
  else if (isObject(value)) Object.values(value).forEach((v) => templateStrings(v, out))
  return out
}

function isHttpUrlTemplate(url: string) {
  return /^\{\{.+\}\}/.test(url.trim()) || /^https?:\/\/[^\s/]+\.?[^\s]*$/i.test(url.trim())
}

/**
 * Full static validation: single trigger, DAG (no cycles), valid branch
 * handles, reachability, required configuration per node and template
 * references that only point at upstream nodes.
 */
export function validateGraph(graph: AutomationGraph): GraphIssue[] {
  const issues: GraphIssue[] = []
  const triggers = graph.nodes.filter((n) => n.type === "trigger")
  if (triggers.length === 0) issues.push({ severity: "error", message: "Add a trigger node to start the automation." })
  if (triggers.length > 1) triggers.slice(1).forEach((t) => issues.push({ nodeId: t.id, severity: "error", message: "Only one trigger is allowed." }))

  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  for (const e of graph.edges) {
    const src = byId.get(e.source)
    if (!src || !byId.has(e.target)) {
      issues.push({ edgeId: e.id, severity: "error", message: "Connection points at a missing node." })
      continue
    }
    if (byId.get(e.target)!.type === "trigger") issues.push({ edgeId: e.id, nodeId: e.target, severity: "error", message: "Triggers can't have incoming connections." })
    const handles = BRANCH_HANDLES[src.type]
    if (handles && (!e.sourceHandle || !handles.includes(e.sourceHandle)))
      issues.push({ edgeId: e.id, nodeId: src.id, severity: "error", message: `Connect from the ${handles.join(" / ")} handle.` })
  }

  const cycle = findCycle(graph)
  if (cycle) issues.push({ nodeId: cycle[0], severity: "error", message: `The graph contains a loop (${cycle.join(" → ")}). Automations must be acyclic.` })

  if (triggers[0]) {
    const reachable = new Set<string>([triggers[0].id])
    const stack = [triggers[0].id]
    while (stack.length) {
      const id = stack.pop()!
      for (const e of graph.edges) {
        if (e.source !== id || reachable.has(e.target)) continue
        reachable.add(e.target)
        stack.push(e.target)
      }
    }
    for (const n of graph.nodes) if (!reachable.has(n.id)) issues.push({ nodeId: n.id, severity: "warning", message: "Not connected to the trigger — this step never runs." })
    if (graph.nodes.length === 1) issues.push({ nodeId: triggers[0].id, severity: "warning", message: "Add at least one step after the trigger." })
  }

  for (const n of graph.nodes) {
    const c = n.data.config as unknown as Record<string, unknown>
    const err = (message: string) => issues.push({ nodeId: n.id, severity: "error", message })
    switch (n.type) {
      case "trigger":
        if (!TRIGGER_KINDS.has(c.kind as TriggerKind)) err("Choose a trigger type.")
        if (c.kind === "QUIZ_SCORE" && !Number.isFinite(Number(c.scoreThreshold))) err("Set a numeric score threshold.")
        break
      case "condition": {
        const rules = Array.isArray(c.rules) ? (c.rules as { left?: string }[]) : []
        if (rules.length === 0 || rules.some((r) => !r.left || !String(r.left).trim())) err("Every condition needs a value to compare.")
        break
      }
      case "transform": {
        const maps = Array.isArray(c.mappings) ? (c.mappings as { key?: string }[]) : []
        if (maps.length === 0) err("Add at least one mapping.")
        const keys = maps.map((m) => String(m.key ?? "").trim())
        if (keys.some((k) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k))) err("Mapping keys must be identifiers (letters, digits, _).")
        if (new Set(keys).size !== keys.length) err("Mapping keys must be unique.")
        break
      }
      case "delay": {
        const amount = Number(c.amount)
        const ms = amount * ({ seconds: 1e3, minutes: 6e4, hours: 36e5, days: 864e5 }[c.unit as string] ?? 0)
        if (!(amount > 0) || ms > 30 * 864e5) err("Delay must be between 1 second and 30 days.")
        break
      }
      case "approval":
        if (!String(c.reviewers ?? "").trim() && !c.notifyOwner) err("Add reviewer emails or notify the owner.")
        break
      case "http":
        if (!isHttpUrlTemplate(String(c.url ?? ""))) err("Enter a valid http(s) URL.")
        if (Number(c.retries) < 0 || Number(c.retries) > 5) err("Retries must be between 0 and 5.")
        if (Number(c.timeoutMs) < 500 || Number(c.timeoutMs) > 30000) err("Timeout must be 500–30000 ms.")
        if (c.auth === "bearer" && !String(c.authToken ?? "").trim()) err("Enter a bearer token.")
        if (c.auth === "basic" && !String(c.authUser ?? "").trim()) err("Enter a username for basic auth.")
        if (c.auth === "header" && !/^[a-zA-Z0-9-]+$/.test(String(c.authHeaderName ?? ""))) err("Enter a valid auth header name.")
        break
      case "email":
        if (!String(c.to ?? "").trim()) err("Add at least one recipient.")
        if (!String(c.subject ?? "").trim()) err("Add a subject.")
        break
      case "update_submission":
        if (!c.status && !String(c.addTags ?? "").trim() && !String(c.removeTags ?? "").trim() && !String(c.note ?? "").trim())
          err("Choose at least one change to apply.")
        break
      case "chat":
        if (!isHttpUrlTemplate(String(c.webhookUrl ?? "")) || /\/services\/?$/.test(String(c.webhookUrl))) err("Paste the incoming webhook URL.")
        if (!String(c.text ?? "").trim()) err("Write a message.")
        break
      case "notify":
        if (!String(c.title ?? "").trim()) err("Add a notification title.")
        break
    }
    // References must point at upstream nodes.
    const ancestors = new Set(ancestorsOf(graph, n.id))
    for (const s of templateStrings(n.data.config)) {
      for (const m of s.matchAll(NODE_REF)) {
        const ref = m[1]
        if (!byId.has(ref)) issues.push({ nodeId: n.id, severity: "error", message: `Unknown step "${ref}" in a variable.` })
        else if (!ancestors.has(ref)) issues.push({ nodeId: n.id, severity: "error", message: `"${ref}" doesn't run before this step.` })
      }
    }
  }
  return issues
}

export function hasErrors(issues: GraphIssue[]) {
  return issues.some((i) => i.severity === "error")
}

export function triggerOf(graph: AutomationGraph) {
  return graph.nodes.find((n) => n.type === "trigger") as AutomationNode<"trigger"> | undefined
}

/** Next readable node id like http_2 */
export function nextNodeId(graph: AutomationGraph, prefix: string) {
  let i = 1
  const ids = new Set(graph.nodes.map((n) => n.id))
  while (ids.has(`${prefix}_${i}`)) i++
  return `${prefix}_${i}`
}
