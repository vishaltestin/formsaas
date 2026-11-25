import { apiRoute, json } from "@/lib/api/handler"

export const runtime = "nodejs"

/** Introspects the calling API key (any valid key; no scope required). */
export const GET = apiRoute(null, async ({ key, scopes, membership }) =>
  json({
    data: {
      object: "api_key",
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scopes,
      rateLimitPerMinute: key.rateLimit,
      expiresAt: key.expiresAt?.toISOString() ?? null,
      workspace: { id: membership.workspaceId, name: membership.workspaceName, role: membership.role },
    },
  })
)
