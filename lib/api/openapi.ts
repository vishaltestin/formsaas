import { FIELD_TYPES } from "@/lib/form-engine"
import { API_SCOPES, SCOPE_DESCRIPTIONS } from "./keys"

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const errorResponses = {
  "400": { description: "Invalid request", content: { "application/json": { schema: ref("Error") } } },
  "401": { description: "Missing, invalid, expired or revoked API key", content: { "application/json": { schema: ref("Error") } } },
  "403": { description: "Missing scope or plan limit reached", content: { "application/json": { schema: ref("Error") } } },
  "404": { description: "Not found", content: { "application/json": { schema: ref("Error") } } },
  "429": { description: "Rate limited — see Retry-After", content: { "application/json": { schema: ref("Error") } } },
}
const FIELD_VALUE_SHAPES =
  "Submission value shapes by type: full_name {first, last, title?, middle?}; address {line1, line2?, city, state?, postal, country}; " +
  "date_range {start, end} (YYYY-MM-DD); appointment {date, time}; datetime YYYY-MM-DDTHH:MM; ranking string[] (every option value, best first); " +
  "country ISO 3166-1 alpha-2; phone '+<dial code> <number>' when the country picker is enabled; currency and slider numbers; color #RRGGBB."

const idParam = (name: string, description: string) => ({ name, in: "path", required: true, schema: { type: "string" }, description })
const pageParams = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
  { name: "cursor", in: "query", schema: { type: "string" }, description: "`nextCursor` from the previous page" },
]
const list = (item: string) => ({
  type: "object",
  properties: { object: { const: "list" }, data: { type: "array", items: ref(item) }, hasMore: { type: "boolean" }, nextCursor: { type: ["string", "null"] } },
})
const wrap = (schema: object) => ({ type: "object", properties: { data: schema } })
const ok = (description: string, schema: object, status = "200") => ({ [status]: { description, content: { "application/json": { schema } } } })

export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Digital Fueled API",
      version: "1.0.0",
      description:
        "REST API for forms, submissions, analytics and automations. Authenticate with `Authorization: Bearer fs_live_…`. Keys are scoped; every response carries `X-RateLimit-*` and `X-Request-Id` headers. Errors use `{ error: { code, message, details? } }`.",
    },
    servers: [{ url: `${baseUrl}/api/v1` }],
    security: [{ bearerAuth: [] }],
    tags: [{ name: "Forms" }, { name: "Submissions" }, { name: "Analytics" }, { name: "Automations" }, { name: "Keys" }],
    paths: {
      "/me": { get: { tags: ["Keys"], summary: "Introspect the current API key", responses: { ...ok("The calling key", wrap(ref("ApiKey"))), "401": errorResponses["401"] } } },
      "/forms": {
        get: {
          tags: ["Forms"],
          summary: "List forms",
          "x-scope": "forms:read",
          parameters: [...pageParams, { name: "status", in: "query", schema: { enum: ["DRAFT", "PUBLISHED", "CLOSED"] } }],
          responses: { ...ok("Forms", list("Form")), ...errorResponses },
        },
        post: {
          tags: ["Forms"],
          summary: "Create a form",
          "x-scope": "forms:write",
          requestBody: { required: true, content: { "application/json": { schema: ref("FormCreate") } } },
          responses: { ...ok("Created", wrap(ref("Form")), "201"), ...errorResponses },
        },
      },
      "/forms/{formId}": {
        parameters: [idParam("formId", "Form ID")],
        get: { tags: ["Forms"], summary: "Retrieve a form", "x-scope": "forms:read", responses: { ...ok("Form", wrap(ref("Form"))), ...errorResponses } },
        patch: {
          tags: ["Forms"],
          summary: "Update a form (draft schema, metadata or status)",
          "x-scope": "forms:write",
          requestBody: { required: true, content: { "application/json": { schema: ref("FormUpdate") } } },
          responses: { ...ok("Updated", wrap(ref("Form"))), ...errorResponses },
        },
        delete: { tags: ["Forms"], summary: "Delete a form", "x-scope": "forms:write", responses: { ...ok("Deleted", ref("Deleted")), ...errorResponses } },
      },
      "/forms/{formId}/publish": {
        parameters: [idParam("formId", "Form ID")],
        post: { tags: ["Forms"], summary: "Publish the current draft as a new version", "x-scope": "forms:write", responses: { ...ok("Published", wrap(ref("Form"))), ...errorResponses } },
      },
      "/forms/{formId}/submissions": {
        parameters: [idParam("formId", "Form ID")],
        get: {
          tags: ["Submissions"],
          summary: "List submissions",
          "x-scope": "submissions:read",
          parameters: [...pageParams, { name: "status", in: "query", schema: { enum: ["NEW", "REVIEWED", "FLAGGED", "ARCHIVED"] } }, { name: "since", in: "query", schema: { type: "string", format: "date-time" } }],
          responses: { ...ok("Submissions", list("Submission")), ...errorResponses },
        },
        post: {
          tags: ["Submissions"],
          summary: "Create a submission",
          description:
            "Validated with the same Zod schema, conditional logic, calculated fields, caps and plan quotas as the hosted form. Fires webhooks and automations. Send `Idempotency-Key` to make retries safe (24h window).",
          "x-scope": "submissions:write",
          parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string", maxLength: 191 } }],
          requestBody: { required: true, content: { "application/json": { schema: ref("SubmissionCreate") } } },
          responses: {
            ...ok("Created", wrap(ref("Submission")), "201"),
            "409": { description: "Idempotency key in use / form not published", content: { "application/json": { schema: ref("Error") } } },
            "422": { description: "Validation failed (details keyed by field key) or idempotency key reused", content: { "application/json": { schema: ref("Error") } } },
            ...errorResponses,
          },
        },
      },
      "/submissions/{submissionId}": {
        parameters: [idParam("submissionId", "Submission ID")],
        get: { tags: ["Submissions"], summary: "Retrieve a submission", "x-scope": "submissions:read", responses: { ...ok("Submission", wrap(ref("Submission"))), ...errorResponses } },
        patch: {
          tags: ["Submissions"],
          summary: "Update status, tags or notes",
          "x-scope": "submissions:write",
          requestBody: { required: true, content: { "application/json": { schema: ref("SubmissionUpdate") } } },
          responses: { ...ok("Updated", wrap(ref("Submission"))), ...errorResponses },
        },
        delete: { tags: ["Submissions"], summary: "Delete a submission", "x-scope": "submissions:write", responses: { ...ok("Deleted", ref("Deleted")), ...errorResponses } },
      },
      "/forms/{formId}/analytics": {
        parameters: [idParam("formId", "Form ID")],
        get: {
          tags: ["Analytics"],
          summary: "Form analytics",
          "x-scope": "analytics:read",
          parameters: [{ name: "days", in: "query", schema: { enum: [7, 30, 90], default: 30 } }],
          responses: { ...ok("Analytics", wrap({ type: "object" })), ...errorResponses },
        },
      },
      "/forms/{formId}/automations": {
        parameters: [idParam("formId", "Form ID")],
        get: { tags: ["Automations"], summary: "List automations of a form", "x-scope": "forms:read", responses: { ...ok("Automations", { type: "object" }), ...errorResponses } },
      },
      "/automations/{automationId}/trigger": {
        parameters: [idParam("automationId", "Automation ID")],
        post: {
          tags: ["Automations"],
          summary: "Trigger a Manual / API automation",
          "x-scope": "automations:trigger",
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", properties: { submissionId: { type: "string" }, data: { type: "object", additionalProperties: true } }, additionalProperties: false },
              },
            },
          },
          responses: { ...ok("Run started (may be waiting for approval or a delay)", wrap({ type: "object" }), "202"), ...errorResponses },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: `API key. Scopes: ${API_SCOPES.map((s) => `\`${s}\` — ${SCOPE_DESCRIPTIONS[s]}`).join("; ")}`,
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" }, details: {} } } },
        },
        Deleted: { type: "object", properties: { id: { type: "string" }, object: { type: "string" }, deleted: { const: true } } },
        ApiKey: {
          type: "object",
          properties: { id: { type: "string" }, name: { type: "string" }, prefix: { type: "string" }, scopes: { type: "array", items: { enum: [...API_SCOPES] } }, rateLimitPerMinute: { type: "integer" }, expiresAt: { type: ["string", "null"] } },
        },
        Field: {
          type: "object",
          properties: { id: { type: "string" }, key: { type: "string" }, type: { enum: [...FIELD_TYPES], description: FIELD_VALUE_SHAPES }, label: { type: "string" }, required: { type: "boolean" }, options: { type: "array", items: { type: "string" }, description: "Accepted values for choice fields." }, optionLabels: { type: "array", items: { type: "string" } }, readOnly: { type: "boolean" } },
        },
        Form: {
          type: "object",
          properties: {
            id: { type: "string" },
            object: { const: "form" },
            title: { type: "string" },
            description: { type: ["string", "null"] },
            slug: { type: "string" },
            mode: { enum: ["CLASSIC", "CARD", "STEPPER", "QUIZ"] },
            status: { enum: ["DRAFT", "PUBLISHED", "CLOSED"] },
            url: { type: "string", format: "uri" },
            publishedAt: { type: ["string", "null"], format: "date-time" },
            hasUnpublishedChanges: { type: "boolean" },
            fields: { type: "array", items: ref("Field") },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        FormCreate: {
          type: "object",
          required: ["title"],
          properties: { title: { type: "string" }, description: { type: "string" }, mode: { enum: ["CLASSIC", "CARD", "STEPPER", "QUIZ"] }, templateId: { type: "string" }, schema: { type: "object" } },
        },
        FormUpdate: {
          type: "object",
          additionalProperties: false,
          properties: { title: { type: "string" }, description: { type: ["string", "null"] }, mode: { enum: ["CLASSIC", "CARD", "STEPPER", "QUIZ"] }, status: { enum: ["PUBLISHED", "CLOSED"] }, schema: { type: "object" } },
        },
        Submission: {
          type: "object",
          properties: {
            id: { type: "string" },
            object: { const: "submission" },
            formId: { type: "string" },
            status: { enum: ["NEW", "REVIEWED", "FLAGGED", "ARCHIVED"] },
            score: { type: ["integer", "null"] },
            tags: { type: "array", items: { type: "string" } },
            notes: { type: ["string", "null"] },
            data: { type: "object", additionalProperties: true, description: "Answers keyed by field key" },
            metadata: { type: "object" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        SubmissionCreate: {
          type: "object",
          required: ["data"],
          additionalProperties: false,
          properties: {
            data: { type: "object", additionalProperties: true, description: "Answers keyed by field key. Unknown keys are rejected." },
            meta: { type: "object", properties: { referrer: { type: "string" }, url: { type: "string" }, utm: { type: "object", additionalProperties: { type: "string" } } } },
          },
        },
        SubmissionUpdate: {
          type: "object",
          additionalProperties: false,
          properties: { status: { enum: ["NEW", "REVIEWED", "FLAGGED", "ARCHIVED"] }, tags: { type: "array", items: { type: "string" } }, notes: { type: ["string", "null"] } },
        },
      },
    },
  }
}
