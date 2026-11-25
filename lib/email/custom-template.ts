import "server-only"

import Handlebars from "handlebars"
import { convert } from "html-to-text"
import juice from "juice"
import sanitizeHtml from "sanitize-html"

import { escapeHtml } from "@/lib/email/escape"
import { TEMPLATE_HTML_MAX } from "@/lib/email/template-library"
import {
  formatValue,
  isInputField,
  sampleFieldValue,
  type FieldValue,
  type FormSchema,
  type FormValues,
} from "@/lib/form-engine"

/**
 * Workspace HTML email templates.
 *
 *   1. Handlebars renders merge tags. Values are HTML-escaped; only the
 *      pre-built {{answers_table}} is raw. Only the built-in block helpers
 *      (if / unless / each / with) exist, and prototype access stays disabled.
 *   2. juice inlines <style> rules into style="" attributes so Gmail, Outlook
 *      and Apple Mail render the design. Media queries stay in a <style> block.
 *   3. sanitize-html strips scripts, event handlers, forms, iframes, objects and
 *      non-http(s)/mailto/tel links. This catches HTML injected through
 *      respondent answers, even in triple-stash {{{tags}}}.
 *   4. html-to-text produces the plain-text alternative.
 */

const hb = Handlebars.create()
const COMPILE_OPTIONS = {
  knownHelpersOnly: true,
  strict: false,
  preventIndent: true,
} as const

export type TemplateVars = Record<string, unknown>

export class TemplateError extends Error {
  constructor(
    message: string,
    public line: number | null = null
  ) {
    super(message)
    this.name = "TemplateError"
  }
}

function toTemplateError(e: unknown): TemplateError {
  if (e instanceof TemplateError) return e
  const msg = e instanceof Error ? e.message : String(e)
  const lineMatch = /line (\d+)/i.exec(msg) ?? / - (\d+):\d+$/.exec(msg)
  const line = lineMatch ? Number(lineMatch[1]) : null
  const where = line ? ` (line ${line})` : ""
  if (/got 'EOF'/.test(msg))
    return new TemplateError(
      `A block isn't closed${where} — every {{#if}}, {{#unless}}, {{#each}} and {{#with}} needs a matching {{/if}}, {{/unless}}, {{/each}} or {{/with}}.`,
      line
    )
  const unknown = /unknown helper (\S+)/.exec(msg)
  if (unknown)
    return new TemplateError(
      `“${unknown[1]}” isn't a merge tag${where}. Tags are single words such as {{first_name}}; blocks can use #if, #unless, #each and #with.`,
      line
    )
  if (/doesn't match/.test(msg))
    return new TemplateError(
      `A closing tag doesn't match its opening block${where}.`,
      line
    )
  return new TemplateError(
    `Template syntax error${where}: ${msg.split("\n").pop()?.slice(0, 200) ?? msg.slice(0, 200)}`,
    line
  )
}

const BLOCK_HELPERS = new Set(["if", "unless", "each", "with"])

/** Rejects partials, decorators and helper calls; only plain tags and the four built-in blocks are allowed. */
class SafetyVisitor extends Handlebars.Visitor {
  PartialStatement(node: hbs.AST.PartialStatement): void {
    throw new TemplateError(
      `Partials ({{> …}}) aren't supported (line ${node.loc.start.line}).`,
      node.loc.start.line
    )
  }
  PartialBlockStatement(node: hbs.AST.PartialBlockStatement): void {
    throw new TemplateError(
      `Partials ({{#> …}}) aren't supported (line ${node.loc.start.line}).`,
      node.loc.start.line
    )
  }
  DecoratorBlock(node: hbs.AST.DecoratorBlock): void {
    throw new TemplateError(
      `Decorators aren't supported (line ${node.loc.start.line}).`,
      node.loc.start.line
    )
  }
  Decorator(node: hbs.AST.Decorator): void {
    throw new TemplateError(
      `Decorators aren't supported (line ${node.loc.start.line}).`,
      node.loc.start.line
    )
  }
  BlockStatement(node: hbs.AST.BlockStatement): void {
    const name =
      node.path.type === "PathExpression"
        ? (node.path as hbs.AST.PathExpression).original
        : ""
    if (!BLOCK_HELPERS.has(name))
      throw new TemplateError(
        `Only #if, #unless, #each and #with blocks are supported — found “#${name}” (line ${node.loc.start.line}).`,
        node.loc.start.line
      )
    super.BlockStatement(node)
  }
  MustacheStatement(node: hbs.AST.MustacheStatement): void {
    if (node.params.length > 0 || (node.hash && node.hash.pairs.length > 0)) {
      throw new TemplateError(
        `Helpers aren't supported — use a single tag like {{first_name}} (line ${node.loc.start.line}).`,
        node.loc.start.line
      )
    }
    super.MustacheStatement(node)
  }
}

function assertSafe(source: string) {
  new SafetyVisitor().accept(hb.parse(source))
}

/** Throws a TemplateError (with the line number when known) if the template can't compile. */
export function validateTemplateSource(html: string, subject = "") {
  if (html.length > TEMPLATE_HTML_MAX)
    throw new TemplateError(
      `The template is too large (${Math.round(TEMPLATE_HTML_MAX / 1000)} KB max).`
    )
  if (!/\S/.test(html)) throw new TemplateError("The template is empty.")
  try {
    assertSafe(html)
    assertSafe(subject)
    hb.precompile(html, COMPILE_OPTIONS)
    hb.precompile(subject, COMPILE_OPTIONS)
  } catch (e) {
    throw toTemplateError(e)
  }
}

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "html",
    "head",
    "body",
    "meta",
    "title",
    "style",
    "center",
    "font",
    "div",
    "span",
    "p",
    "br",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "pre",
    "code",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "small",
    "sup",
    "sub",
    "mark",
    "a",
    "img",
    "picture",
    "source",
    "ul",
    "ol",
    "li",
    "dl",
    "dt",
    "dd",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "td",
    "th",
    "caption",
    "colgroup",
    "col",
    "header",
    "footer",
    "section",
    "article",
    "main",
    "nav",
    "figure",
    "figcaption",
  ],
  allowVulnerableTags: true, // <style> is needed for media queries; email clients never execute it as script
  allowedAttributes: {
    "*": [
      "style",
      "class",
      "id",
      "align",
      "valign",
      "width",
      "height",
      "bgcolor",
      "background",
      "border",
      "dir",
      "lang",
      "role",
      "title",
      "color",
      "face",
      "size",
    ],
    a: ["href", "target", "rel", "name"],
    img: ["src", "alt", "srcset"],
    source: ["srcset", "media", "type"],
    meta: ["charset", "name", "content", "http-equiv"],
    table: ["cellpadding", "cellspacing", "summary"],
    td: ["colspan", "rowspan", "nowrap"],
    th: ["colspan", "rowspan", "scope", "nowrap"],
    col: ["span"],
    colgroup: ["span"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {
    img: ["http", "https", "cid"],
    source: ["http", "https"],
  },
  allowProtocolRelative: false,
  // Keep the authored CSS; it is parsed by email clients, not by our pages.
  parseStyleAttributes: false,
  disallowedTagsMode: "discard",
  nonTextTags: [
    "script",
    "noscript",
    "textarea",
    "option",
    "iframe",
    "object",
    "embed",
    "template",
  ],
}

/** Everything a template sees for one response. */
export function buildTemplateVars(input: {
  schema: FormSchema
  values: FormValues
  visibleFieldIds?: Set<string>
  extras?: Record<string, string | number | null | undefined>
}): TemplateVars {
  const vars: TemplateVars = {}
  const answers: { key: string; label: string; value: string }[] = []
  for (const f of input.schema.fields) {
    if (!isInputField(f) || f.type === "password" || f.type === "signature")
      continue
    const value = formatValue(f, input.values[f.id])
    vars[f.key] = value
    if (
      f.type !== "hidden" &&
      value !== "" &&
      (!input.visibleFieldIds || input.visibleFieldIds.has(f.id))
    )
      answers.push({ key: f.key, label: f.label, value })
  }
  for (const [k, v] of Object.entries(input.extras ?? {}))
    vars[k] = v === null || v === undefined ? "" : v
  vars.answers = answers
  vars.answers_table = new hb.SafeString(answersTableHtml(answers))
  return vars
}

export function answersTableHtml(rows: { label: string; value: string }[]) {
  if (rows.length === 0) return ""
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:8px 16px 8px 0;border-bottom:1px solid #eeeeee;color:#6b7280;font-size:14px;vertical-align:top;width:38%">${escapeHtml(r.label)}</td><td style="padding:8px 0;border-bottom:1px solid #eeeeee;font-size:14px;vertical-align:top">${escapeHtml(r.value).replace(/\n/g, "<br>")}</td></tr>`
    )
    .join("")
  return `<table role="presentation" class="answers" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">${body}</table>`
}

/** Plain text (e.g. an automation message) as safe paragraphs, for {{email_body_html}}. */
export function messageHtml(text: string) {
  const html = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`
    )
    .join("")
  return new hb.SafeString(html)
}

/** Renders a stored template for one recipient. Throws TemplateError on template bugs. */
export function renderCustomEmail(
  template: { html: string; subject: string },
  vars: TemplateVars,
  opts: { subjectOverride?: string } = {}
) {
  let rendered: string
  let subject: string
  try {
    assertSafe(template.html)
    rendered = hb.compile(template.html, COMPILE_OPTIONS)(vars)
    const subjectSource = opts.subjectOverride?.trim()
      ? opts.subjectOverride
      : template.subject
    assertSafe(subjectSource)
    // Subjects are plain text: render without HTML escaping, then flatten whitespace.
    subject = hb.compile(subjectSource, { ...COMPILE_OPTIONS, noEscape: true })(
      vars
    )
  } catch (e) {
    throw toTemplateError(e)
  }
  const inlined = juice(rendered, {
    preserveMediaQueries: true,
    preserveFontFaces: true,
    applyWidthAttributes: true,
    applyHeightAttributes: true,
    removeStyleTags: true,
  })
  const html = `<!doctype html>\n${sanitizeHtml(inlined, SANITIZE)}`.slice(
    0,
    1_000_000
  )
  const text = convert(html, {
    wordwrap: 100,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "title", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "table.answers", format: "dataTable" },
    ],
  }).trim()
  return {
    html,
    text,
    subject: subject.replace(/\s+/g, " ").trim().slice(0, 300),
  }
}

/** Realistic sample answers for previews and test sends. */
export function sampleVars(input: {
  schema: FormSchema | null
  formTitle: string
  workspaceName: string
  receiptUrl?: string | null
  dashboardUrl?: string | null
}): TemplateVars {
  const schema: FormSchema | null = input.schema
  const extras = {
    form_title: input.formTitle,
    submission_id: "sub_8f2k1q9x",
    submitted_at: new Date("2026-11-25T09:30:00Z").toUTCString(),
    receipt_url: input.receiptUrl ?? null,
    dashboard_url: input.dashboardUrl ?? null,
    score: 8,
    max_score: 10,
    outcome: "Great fit",
    workspace_name: input.workspaceName,
  }
  const body =
    "Thanks for reaching out.\n\nWe'll be in touch within one business day."
  const automation = { email_body: body, email_body_html: messageHtml(body) }
  if (schema && schema.fields.some(isInputField)) {
    const values: FormValues = {}
    for (const f of schema.fields)
      values[f.id] = sampleFieldValue(f) as FieldValue
    return { ...automation, ...buildTemplateVars({ schema, values, extras }) }
  }
  const answers = [
    { key: "first_name", label: "First name", value: "Ada" },
    { key: "email", label: "Email", value: "ada@example.com" },
    { key: "company", label: "Company", value: "Analytical Engines Ltd" },
    {
      key: "message",
      label: "Message",
      value: "Looking forward to hearing from you.",
    },
  ]
  return {
    ...automation,
    ...Object.fromEntries(answers.map((a) => [a.key, a.value])),
    ...extras,
    answers,
    answers_table: new hb.SafeString(answersTableHtml(answers)),
  }
}
