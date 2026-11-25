"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { hasErrors, normalizeGraph, triggerOf, validateGraph, type GraphIssue } from "@/lib/automations/graph"
import { cancelRun, decideApproval, getRunWithSteps, replayRun, sampleTriggerData, startRun } from "@/lib/automations/runner"
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates"
import type { AutomationGraph, TriggerKind } from "@/lib/automations/types"
import { toRunView, type RunView } from "@/lib/automations/view"
import { getEffectivePlan } from "@/lib/entitlements"
import { prisma } from "@/lib/prisma"
import type { FormPermission } from "@/lib/rbac/policy"
import { assertFormAccess } from "@/lib/rbac/server"

const idSchema = z.string().min(1).max(40)

/** Loads an automation and requires automations.manage on its form (live RBAC check). */
async function assertOwnedAutomation(automationId: string) {
  const automation = await prisma.automation.findUnique({ where: { id: idSchema.parse(automationId) }, include: { form: { select: { userId: true } } } })
  if (!automation) throw new Error("Automation not found.")
  const { user } = await assertFormAccess(automation.formId, "automations.manage")
  return { user, automation }
}

async function assertOwnedRun(runId: string, permission: FormPermission = "automations.manage") {
  const run = await prisma.automationRun.findUnique({ where: { id: idSchema.parse(runId) }, include: { automation: { include: { form: { select: { userId: true, id: true } } } } } })
  if (!run) throw new Error("Run not found.")
  const { user } = await assertFormAccess(run.automation.formId, permission)
  return { user, run }
}

function revalidate(formId: string) {
  revalidatePath(`/dashboard/forms/${formId}/automations`)
}

/** HTTP and chat nodes reach external systems — gated by the plan's webhook feature. */
async function assertGraphEntitled(ownerId: string, graph: AutomationGraph) {
  const needsWebhooks = graph.nodes.some((n) => n.type === "http" || n.type === "chat")
  if (!needsWebhooks) return
  const plan = await getEffectivePlan(ownerId)
  if (!plan.features.webhooks) throw Object.assign(new Error("HTTP and Slack/Discord steps require a plan with webhooks. Upgrade to Pro to use them."), { capability: "webhooks" })
}

export async function createAutomation(formId: string, input: { name: string; template: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const { form } = await assertFormAccess(formId, "automations.manage")
    const name = z.string().trim().min(1).max(80).parse(input.name)
    const tpl = AUTOMATION_TEMPLATES.find((t) => t.id === input.template) ?? AUTOMATION_TEMPLATES[0]
    const graph = tpl.build()
    const count = await prisma.automation.count({ where: { formId } })
    if (count >= 25) throw new Error("A form can have at most 25 automations.")
    const a = await prisma.automation.create({
      data: { formId: form.id, name, description: tpl.id === "blank" ? null : tpl.description, enabled: false, trigger: "FORM_SUBMITTED", graph: graph as object },
    })
    revalidate(formId)
    return ok({ id: a.id })
  } catch (e) {
    return fail(e)
  }
}

const saveSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  enabled: z.boolean(),
  graph: z.object({ nodes: z.array(z.any()).max(100), edges: z.array(z.any()).max(300) }),
})

export async function saveAutomation(automationId: string, input: z.input<typeof saveSchema>): Promise<ActionResult<{ issues: GraphIssue[]; enabled: boolean }>> {
  try {
    const { automation } = await assertOwnedAutomation(automationId)
    const parsed = saveSchema.parse(input)
    const graph = normalizeGraph(parsed.graph)
    const issues = validateGraph(graph)
    if (parsed.enabled && hasErrors(issues)) throw new Error(`Fix ${issues.filter((i) => i.severity === "error").length} issue(s) before enabling.`)
    const form = await prisma.form.findUniqueOrThrow({ where: { id: automation.formId }, select: { userId: true } })
    if (parsed.enabled) await assertGraphEntitled(form.userId, graph)
    const trigger = (triggerOf(graph)?.data.config.kind ?? "FORM_SUBMITTED") as TriggerKind
    await prisma.automation.update({
      where: { id: automation.id },
      data: { name: parsed.name, description: parsed.description || null, enabled: parsed.enabled, trigger, graph: graph as object },
    })
    revalidate(automation.formId)
    return ok({ issues, enabled: parsed.enabled })
  } catch (e) {
    return fail(e)
  }
}

export async function setAutomationEnabled(automationId: string, enabled: boolean): Promise<ActionResult<{ enabled: boolean }>> {
  try {
    const { automation } = await assertOwnedAutomation(automationId)
    if (enabled) {
      const graph = normalizeGraph(automation.graph)
      const issues = validateGraph(graph)
      if (hasErrors(issues)) throw new Error(issues.find((i) => i.severity === "error")!.message)
      await assertGraphEntitled(automation.form.userId, graph)
    }
    await prisma.automation.update({ where: { id: automation.id }, data: { enabled } })
    revalidate(automation.formId)
    return ok({ enabled })
  } catch (e) {
    return fail(e)
  }
}

export async function duplicateAutomation(automationId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { automation } = await assertOwnedAutomation(automationId)
    const copy = await prisma.automation.create({
      data: {
        formId: automation.formId,
        name: `${automation.name} (copy)`.slice(0, 80),
        description: automation.description,
        enabled: false,
        trigger: automation.trigger,
        graph: automation.graph as object,
      },
    })
    revalidate(automation.formId)
    return ok({ id: copy.id })
  } catch (e) {
    return fail(e)
  }
}

export async function deleteAutomation(automationId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { automation } = await assertOwnedAutomation(automationId)
    await prisma.automation.delete({ where: { id: automation.id } })
    revalidate(automation.formId)
    return ok({ id: automation.id })
  } catch (e) {
    return fail(e)
  }
}

/** Canvas test run against the (possibly unsaved) graph using the latest submission or sample data. */
export async function testRunAutomation(automationId: string, rawGraph: unknown): Promise<ActionResult<{ run: RunView; issues: GraphIssue[] }>> {
  try {
    const { automation } = await assertOwnedAutomation(automationId)
    const graph = normalizeGraph(rawGraph)
    const issues = validateGraph(graph)
    if (hasErrors(issues)) return ok({ run: null as unknown as RunView, issues })
    await assertGraphEntitled(automation.form.userId, graph)
    const kind = (triggerOf(graph)?.data.config.kind ?? "FORM_SUBMITTED") as TriggerKind
    const sample = await sampleTriggerData(automation.formId, kind)
    const run = await startRun({ automation, triggerType: kind, triggerData: sample.triggerData, submissionId: sample.submissionId, isTest: true, graph })
    const full = await getRunWithSteps(run.id)
    revalidate(automation.formId)
    return ok({ run: toRunView(full!), issues })
  } catch (e) {
    return fail(e)
  }
}

export async function getAutomationRun(runId: string): Promise<ActionResult<RunView>> {
  try {
    await assertOwnedRun(runId)
    const full = await getRunWithSteps(runId)
    return ok(toRunView(full!))
  } catch (e) {
    return fail(e)
  }
}

export async function replayAutomationRun(runId: string, mode: "latest" | "snapshot" = "latest"): Promise<ActionResult<RunView>> {
  try {
    const { run } = await assertOwnedRun(runId)
    const replay = await replayRun(run.id, mode === "snapshot" ? "snapshot" : "latest")
    const full = await getRunWithSteps(replay.id)
    revalidate(run.automation.formId)
    return ok(toRunView(full!))
  } catch (e) {
    return fail(e)
  }
}

export async function decideAutomationApproval(runId: string, decision: "approved" | "rejected", comment?: string): Promise<ActionResult<RunView>> {
  try {
    const { user, run } = await assertOwnedRun(runId, "automations.approve")
    const d = z.enum(["approved", "rejected"]).parse(decision)
    await decideApproval(run.id, d, user.email ?? user.name ?? "owner", z.string().max(2000).optional().parse(comment))
    const full = await getRunWithSteps(run.id)
    revalidate(run.automation.formId)
    return ok(toRunView(full!))
  } catch (e) {
    return fail(e)
  }
}

export async function cancelAutomationRun(runId: string): Promise<ActionResult<{ cancelled: boolean }>> {
  try {
    const { run } = await assertOwnedRun(runId)
    const cancelled = await cancelRun(run.id)
    if (!cancelled) throw new Error("Only waiting runs can be cancelled.")
    revalidate(run.automation.formId)
    return ok({ cancelled })
  } catch (e) {
    return fail(e)
  }
}
