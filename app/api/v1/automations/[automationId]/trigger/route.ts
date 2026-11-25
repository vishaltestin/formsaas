import { z } from "zod"

import { ApiError, apiRoute, json, ownedForm, readJson } from "@/lib/api/handler"
import { getRunWithSteps, triggerManually } from "@/lib/automations/runner"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

const bodySchema = z.object({ submissionId: z.string().max(40).optional(), data: z.record(z.string(), z.unknown()).optional() }).strict()

/** Runs an automation now. Its trigger must be "Manual / API" and it must be enabled. */
export const POST = apiRoute<{ automationId: string }>("automations:trigger", async (ctx, { automationId }) => {
  const automation = await prisma.automation.findUnique({ where: { id: z.string().max(40).parse(automationId) } })
  if (!automation) throw new ApiError(404, "not_found", "Automation not found.")
  try {
    await ownedForm(ctx, automation.formId, "automations.manage")
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw new ApiError(404, "not_found", "Automation not found.")
    throw e
  }
  if (!automation.enabled) throw new ApiError(409, "automation_disabled", "Enable the automation before triggering it.")
  if (automation.trigger !== "MANUAL") throw new ApiError(409, "not_manual", "Only automations with a Manual / API trigger can be triggered from the API.")
  const body = bodySchema.parse(await readJson(ctx.req))
  let run
  try {
    run = await triggerManually(automation, body)
  } catch (e) {
    throw new ApiError(422, "trigger_failed", e instanceof Error ? e.message : "Could not trigger the automation.")
  }
  const full = await getRunWithSteps(run.id)
  return json(
    {
      data: {
        id: run.id,
        object: "automation_run",
        status: run.status,
        durationMs: run.durationMs,
        error: run.error,
        steps: full?.steps.map((s) => ({ nodeId: s.nodeId, type: s.nodeType, status: s.status, durationMs: s.durationMs, output: s.output, error: s.error })) ?? [],
      },
    },
    202
  )
})
