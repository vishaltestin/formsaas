/** API key scopes — client-safe (no Node APIs), shared by the developer portal UI and the server. */

export const API_SCOPES = [
  "forms:read",
  "forms:write",
  "submissions:read",
  "submissions:write",
  "automations:trigger",
  "analytics:read",
] as const
export type ApiScope = (typeof API_SCOPES)[number]

export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  "forms:read": "List and read forms, fields and automations",
  "forms:write": "Create, update, publish and delete forms",
  "submissions:read": "List and read submissions",
  "submissions:write": "Create, update and delete submissions",
  "automations:trigger": "Trigger manual automations",
  "analytics:read": "Read form analytics",
}
