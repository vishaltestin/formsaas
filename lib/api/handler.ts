import "server-only"

import { randomUUID } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { ZodError } from "zod"

import type { ApiKey, Form } from "@/generated/prisma/client"
import { EntitlementError } from "@/lib/entitlements"
import { prisma } from "@/lib/prisma"
import { clientIp } from "@/lib/public-form"
import { getMembership, resolveFormAccess, type Membership } from "@/lib/rbac/core"
import { levelAllows, requiredLevel, type FormPermission } from "@/lib/rbac/policy"
import { hitRateLimit, rateLimitHeaders, type RateLimitResult } from "@/lib/rate-limit"

import { hashApiKey, parseBearer, parseScopes, type ApiScope } from "./keys"

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
  }
}

export interface ApiContext {
  req: NextRequest
  key: ApiKey
  userId: string
  /** Workspace the key is bound to; the key owner's membership is re-verified on every request. */
  workspaceId: string
  membership: Membership
  scopes: ApiScope[]
  ip: string
  requestId: string
}

type RouteCtx<P> = { params: Promise<P> }

export function apiError(status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status, headers })
}

function logRequest(input: { userId: string; apiKeyId: string | null; method: string; path: string; status: number; durationMs: number; ip: string; error?: string | null }) {
  void prisma.apiRequestLog
    .create({
      data: {
        userId: input.userId,
        apiKeyId: input.apiKeyId,
        method: input.method,
        path: input.path.slice(0, 500),
        status: input.status,
        durationMs: input.durationMs,
        ip: input.ip,
        error: input.error?.slice(0, 2000) ?? null,
      },
    })
    .catch((e) => console.error("[api] failed to write request log", e instanceof Error ? e.message : e))
}

export async function authenticate(req: NextRequest): Promise<{ key: ApiKey } | { error: Response }> {
  const raw = parseBearer(req.headers.get("authorization"))
  if (!raw) return { error: apiError(401, "unauthorized", "Missing bearer token. Send `Authorization: Bearer <api key>`.") }
  const key = await prisma.apiKey.findUnique({ where: { hash: hashApiKey(raw) } })
  if (!key) return { error: apiError(401, "invalid_api_key", "The API key is invalid.") }
  if (key.revokedAt) return { error: apiError(401, "api_key_revoked", "This API key has been revoked.") }
  if (key.expiresAt && key.expiresAt < new Date()) return { error: apiError(401, "api_key_expired", "This API key has expired.") }
  return { key }
}

/**
 * Wraps a /api/v1 route: Bearer auth → scope check → DB rate limit → handler,
 * with uniform JSON errors, rate-limit headers, a request id and an
 * ApiRequestLog row for every authenticated request.
 */
export function apiRoute<P = Record<string, never>>(scope: ApiScope | null, handler: (ctx: ApiContext, params: P) => Promise<Response>) {
  return async (req: NextRequest, routeCtx: RouteCtx<P>): Promise<Response> => {
    const started = performance.now()
    const requestId = randomUUID()
    const ip = clientIp(req.headers)
    const path = req.nextUrl.pathname + (req.nextUrl.search || "")
    const auth = await authenticate(req)
    if ("error" in auth) {
      auth.error.headers.set("X-Request-Id", requestId)
      return auth.error
    }
    const { key } = auth
    let response: Response
    let errorMessage: string | null = null
    let rl: RateLimitResult | null = null
    try {
      const scopes = parseScopes(key.scopes)
      if (scope && !scopes.includes(scope)) throw new ApiError(403, "insufficient_scope", `This API key is missing the "${scope}" scope.`, { required: scope, granted: scopes })
      const membership = await getMembership(key.userId, key.workspaceId)
      if (!membership) throw new ApiError(403, "workspace_access_revoked", "The owner of this API key is no longer a member of its workspace.")
      rl = await hitRateLimit(`api:${key.id}`, Math.max(1, key.rateLimit), 60_000)
      if (!rl.allowed) throw new ApiError(429, "rate_limited", `Rate limit of ${key.rateLimit} requests per minute exceeded.`)
      response = await handler({ req, key, userId: key.userId, workspaceId: key.workspaceId, membership, scopes, ip, requestId }, await routeCtx.params)
    } catch (e) {
      if (e instanceof ApiError) {
        response = apiError(e.status, e.code, e.message, e.details)
        errorMessage = e.message
      } else if (e instanceof ZodError) {
        const details = e.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
        response = apiError(400, "invalid_request", "The request body or query is invalid.", details)
        errorMessage = details.map((d) => `${d.path}: ${d.message}`).join("; ")
      } else if (e instanceof EntitlementError) {
        response = apiError(403, "plan_limit", e.message)
        errorMessage = e.message
      } else if (e instanceof SyntaxError) {
        response = apiError(400, "invalid_json", "Request body must be valid JSON.")
        errorMessage = e.message
      } else {
        console.error("[api] unhandled error", e)
        response = apiError(500, "internal_error", "Something went wrong. The error has been logged.")
        errorMessage = e instanceof Error ? e.message : "internal error"
      }
    }
    const durationMs = Math.round(performance.now() - started)
    response.headers.set("X-Request-Id", requestId)
    response.headers.set("X-Response-Time", `${durationMs}ms`)
    if (rl) for (const [k, v] of Object.entries(rateLimitHeaders(rl))) response.headers.set(k, v)
    logRequest({ userId: key.userId, apiKeyId: key.id, method: req.method, path, status: response.status, durationMs, ip, error: errorMessage })
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000)
      void prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
    return response
  }
}

export async function readJson(req: NextRequest): Promise<unknown> {
  const text = await req.text()
  if (text.length > 10 * 1024 * 1024) throw new ApiError(413, "payload_too_large", "Request body exceeds 10 MB.")
  if (!text.trim()) return {}
  return JSON.parse(text) as unknown
}

/**
 * Loads a form the key may act on: it must live in the key's workspace and the
 * key owner's live access level must allow `permission`. Forms outside the
 * workspace (or invisible to the owner) are a plain 404 — no existence oracle.
 */
export async function ownedForm(ctx: ApiContext, formId: string, permission: FormPermission = "form.view"): Promise<Form> {
  const access = await resolveFormAccess(ctx.userId, formId)
  if (!access || access.form.workspaceId !== ctx.workspaceId) throw new ApiError(404, "not_found", "Form not found.")
  if (!levelAllows(access.level, permission))
    throw new ApiError(403, "forbidden", `Your ${access.level.toLowerCase()} access to this form doesn't allow this (needs ${requiredLevel(permission).toLowerCase()}).`)
  return access.form
}

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers })
}

export function pageParams(req: NextRequest, max = 100) {
  const sp = req.nextUrl.searchParams
  const limit = Math.max(1, Math.min(max, Number(sp.get("limit") ?? 25) || 25))
  const cursor = sp.get("cursor") || undefined
  return { limit, cursor }
}
