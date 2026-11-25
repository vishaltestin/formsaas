/** Client-safe constants for workspace HTML email templates. */

export const TEMPLATE_HTML_MAX = 200_000
export const TEMPLATES_PER_WORKSPACE = 100
export const ASSET_MAX_BYTES = 2 * 1024 * 1024
export const ASSETS_PER_WORKSPACE = 200
export const ASSET_BYTES_PER_WORKSPACE = 50 * 1024 * 1024
export const ASSET_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const

export interface MergeTag {
  tag: string
  label: string
  /** Rendered as raw (pre-escaped) HTML */
  html?: boolean
  /** Only filled in some contexts */
  note?: string
}

/** Tags every template can use, on top of {{field_key}} for each question. */
export const MERGE_TAGS: MergeTag[] = [
  { tag: "form_title", label: "Form title" },
  { tag: "submission_id", label: "Response reference" },
  { tag: "submitted_at", label: "Submitted at (UTC)" },
  { tag: "answers_table", label: "All answers as a table", html: true },
  {
    tag: "receipt_url",
    label: "Respondent receipt link",
    note: "Thank-you emails, when receipts are on",
  },
  {
    tag: "dashboard_url",
    label: "Link to the response in the dashboard",
    note: "Notifications and automations",
  },
  { tag: "score", label: "Quiz score" },
  { tag: "max_score", label: "Maximum score" },
  { tag: "outcome", label: "Quiz outcome" },
  { tag: "workspace_name", label: "Workspace name" },
  {
    tag: "email_body_html",
    label: "Automation step message (paragraphs)",
    html: true,
    note: "Automation emails",
  },
  {
    tag: "email_body",
    label: "Automation step message (plain)",
    note: "Automation emails",
  },
]

export const BLOCK_SNIPPETS: { label: string; code: string }[] = [
  {
    label: "Show only when answered",
    code: "{{#if company}}\n  <p>Company: {{company}}</p>\n{{/if}}",
  },
  {
    label: "Loop over answers",
    code: "{{#each answers}}\n  <p><strong>{{label}}</strong><br>{{value}}</p>\n{{/each}}",
  },
  {
    label: "Fallback text",
    code: "{{#if first_name}}Hi {{first_name}},{{else}}Hi there,{{/if}}",
  },
]

export interface TemplateStarter {
  id: string
  name: string
  description: string
  subject: string
  html: string
}

const BLANK = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { margin: 0; padding: 24px; background: #ffffff; font-family: Arial, Helvetica, sans-serif; color: #1f2933; }
    </style>
  </head>
  <body>
    <p>Hi,</p>
    <p>Thanks for completing {{form_title}}.</p>
    {{answers_table}}
  </body>
</html>
`

const BRANDED = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{form_title}}</title>
    <style>
      body { margin: 0; padding: 0; background: #f3f1ec; font-family: Georgia, 'Times New Roman', serif; color: #1d2a3a; }
      .wrap { width: 100%; padding: 32px 12px; }
      .card { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e4dfd5; }
      .banner { display: block; width: 100%; height: auto; border: 0; }
      .brand { padding: 20px 32px; background: #1d3b6e; color: #ffffff; font-size: 18px; letter-spacing: 0.04em; }
      .body { padding: 32px; font-size: 16px; line-height: 1.6; }
      h1 { margin: 0 0 12px; font-size: 26px; font-weight: normal; }
      .button { display: inline-block; padding: 12px 22px; background: #c8742c; color: #ffffff !important; text-decoration: none; font-family: Arial, sans-serif; font-size: 14px; }
      .answers td { padding: 6px 12px 6px 0; border-bottom: 1px solid #eee; font-size: 14px; vertical-align: top; }
      .footer { padding: 20px 32px; font-size: 12px; color: #7a8594; font-family: Arial, sans-serif; }
      @media (max-width: 600px) { .body, .brand, .footer { padding-left: 20px; padding-right: 20px; } h1 { font-size: 22px; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="brand">Your Company</div>
        <!-- Replace with your own banner: upload it under Images and click Insert -->
        <div class="body">
          <h1>{{#if first_name}}Thank you, {{first_name}}{{else}}Thank you{{/if}}</h1>
          <p>We have received your answers to <strong>{{form_title}}</strong>. A member of our team will be in touch shortly.</p>
          <p style="margin:24px 0 8px;font-family:Arial,sans-serif;font-size:13px;color:#7a8594">YOUR ANSWERS</p>
          {{answers_table}}
          {{#if receipt_url}}<p style="margin-top:28px"><a class="button" href="{{receipt_url}}">View your receipt</a></p>{{/if}}
        </div>
        <div class="footer">Reference {{submission_id}} &middot; {{submitted_at}}</div>
      </div>
    </div>
  </body>
</html>
`

const NOTIFY = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { margin: 0; padding: 24px; background: #f5f7fa; font-family: -apple-system, Segoe UI, Arial, sans-serif; color: #111827; }
      .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 6px; border: 1px solid #e5e7eb; padding: 28px; }
      .eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
      .button { display: inline-block; margin-top: 20px; padding: 10px 18px; background: #1d4ed8; color: #ffffff !important; border-radius: 4px; text-decoration: none; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="eyebrow">New response</div>
      <h2 style="margin:6px 0 18px">{{form_title}}</h2>
      {{#each answers}}
        <p style="margin:0 0 12px"><span style="color:#6b7280;font-size:13px">{{label}}</span><br>{{value}}</p>
      {{/each}}
      {{#if dashboard_url}}<a class="button" href="{{dashboard_url}}">Open in dashboard</a>{{/if}}
    </div>
  </body>
</html>
`

export const TEMPLATE_STARTERS: TemplateStarter[] = [
  {
    id: "blank",
    name: "Blank",
    description: "A bare HTML document to paste your own design into.",
    subject: "Thanks for your response · {{form_title}}",
    html: BLANK,
  },
  {
    id: "branded",
    name: "Branded letter",
    description: "Banner, brand bar, answers and a receipt button.",
    subject: "We received your response · {{form_title}}",
    html: BRANDED,
  },
  {
    id: "notification",
    name: "Team notification",
    description: "Compact layout for internal new-response alerts.",
    subject: "New response · {{form_title}}",
    html: NOTIFY,
  },
]

/** Checks the file's magic bytes, so a renamed HTML/SVG file can't be stored as an "image". */
export function sniffImageType(
  buf: Uint8Array
): (typeof ASSET_TYPES)[number] | null {
  const b = buf
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return "image/png"
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return "image/jpeg"
  if (
    b.length >= 6 &&
    b[0] === 0x47 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) &&
    b[5] === 0x61
  )
    return "image/gif"
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp"
  return null
}

export function safeAssetName(name: string, mime: string) {
  const ext =
    {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
    }[mime] ?? "img"
  const base =
    (name.split(/[\\/]/).pop() ?? "")
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .toLowerCase() || "image"
  return `${base}.${ext}`
}
