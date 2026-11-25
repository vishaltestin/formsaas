import "server-only"

import { createHmac } from "node:crypto"

import type { Webhook } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

export function signPayload(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

function headerRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[a-z0-9-]+$/i.test(k) && typeof v === "string") out[k] = v
  }
  return out
}

/**
 * Delivers a JSON payload to a webhook with an HMAC-SHA256 signature header:
 *   X-FormStudio-Signature: t=<unix>,v1=<hex hmac of "t.body">
 * Every attempt is logged as a WebhookDelivery row.
 */
export async function deliverWebhook(
  webhook: Pick<Webhook, "id" | "url" | "secret" | "headers">,
  event: string,
  payload: Record<string, unknown>,
  attempt = 1
) {
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = signPayload(webhook.secret, timestamp, body)
  const started = Date.now()
  let statusCode: number | null = null
  let responseBody: string | null = null
  let error: string | null = null

  try {
    const url = new URL(webhook.url)
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http(s) URLs are allowed")
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...headerRecord(webhook.headers),
        "Content-Type": "application/json",
        "User-Agent": "DigitalFueled-Webhooks/1.0",
        "X-FormStudio-Event": event,
        "X-FormStudio-Delivery-Attempt": String(attempt),
        "X-FormStudio-Signature": `t=${timestamp},v1=${signature}`,
      },
      body,
      signal: controller.signal,
      redirect: "manual",
    })
    clearTimeout(timer)
    statusCode = res.status
    responseBody = (await res.text().catch(() => "")).slice(0, 2000)
  } catch (e) {
    error = e instanceof Error ? (e.name === "AbortError" ? "Timed out after 10s" : e.message) : "Request failed"
  }

  const success = statusCode !== null && statusCode >= 200 && statusCode < 300
  return prisma.webhookDelivery.create({
    data: {
      webhookId: webhook.id,
      event,
      statusCode,
      responseMs: Date.now() - started,
      success,
      payload: payload as object,
      responseBody,
      error,
      attempt,
    },
  })
}

/** Fires all active webhooks for a form (used after a submission is stored). */
export async function dispatchFormWebhooks(formId: string, event: string, payload: Record<string, unknown>) {
  const hooks = await prisma.webhook.findMany({ where: { formId, isActive: true } })
  await Promise.allSettled(hooks.map((h) => deliverWebhook(h, event, payload)))
}
