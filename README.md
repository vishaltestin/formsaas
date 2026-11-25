# Digital Fueled

Digital Fueled (codebase: `formstudio`) is a Jotform‑style form builder SaaS: drag‑and‑drop builder, four form modes (Classic, Stepper, Card, Quiz), visual conditional logic, embeds, analytics, signed webhooks, plan entitlements and an admin console.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Prisma 7 (MariaDB/MySQL adapter) · Auth.js v5 (credentials, JWT) · react‑hook‑form + zod 4 · shadcn/ui · dnd‑kit · @xyflow/react · recharts · TanStack Table v9 · qrcode.react · lucide

## Quick start

```bash
cp .env.example .env              # set DATABASE_URL + AUTH_SECRET
npm install                       # runs prisma generate
npm run db:setup                  # prisma migrate deploy + idempotent seed
npm run dev                       # http://localhost:3000
```

Run `npm run verify` before deploying. It runs Prisma generate/validate/push, the idempotent seed, typecheck, lint, unit and integration tests, the production build and the HTTP end-to-end suite. Every step must exit 0.

### Tests

| Command | What it covers |
|---|---|
| `npm run test:unit` | Form engine (validation, hidden conditional fields, cross-field rules, logic, formulas, CSV injection, draft/publish isolation) and automation engine (DAG/cycle validation, IF/ELSE branching, templating, approval pause/resume) |
| `npm run test:integration` | `/api/v1` route handlers against the real DB: Bearer auth, scopes, expiry and revocation, rate limits, Idempotency-Key replay and conflicts, plan limits, validation |
| `npm test` | Unit + integration |
| `npm run test:e2e` | Runs `next start` on :3100 and drives real HTTP flows: public submit, Save & Resume, receipts, embeds, the API, and the automation approval round trip (requires `npm run build`) |

### Demo accounts (seeded)

| Role | Email | Password | Plan |
|---|---|---|---|
| Admin | `admin@formstudio.dev` | `Admin@12345` | Enterprise |
| User | `demo@formstudio.dev` | `Demo@12345` | Pro (180 days) |
| User | `maya@northwind.dev` | `Maya@12345` | Free |
| Team Editor | `lee@formstudio.dev` | `Lee@12345` | — (Editor in Dana's workspace; Edit on the lead form) |
| Team Member | `sam@formstudio.dev` | `Sam@12345` | — (Member in Dana's workspace; reviews Contact & Support via the "Support desk" group) |

The seed is idempotent; running it twice gives the same state. It also creates live forms at `/f/lead-qualification` (Stepper) and `/f/contact-support` (Classic), a draft form for Maya, 44 submissions, 438 analytics events, a webhook with delivery logs, 2 pending upgrade requests, two automations ("Lead routing with approval", active, with 30 runs including one waiting for approval, plus a manual "Escalate ticket"), 3 API keys, 180 API request logs and in-app notifications.

**Demo API key** (demo user, all scopes, 120 req/min): `fs_live_demo0000000000000000000000000000`

```bash
curl -H "Authorization: Bearer fs_live_demo0000000000000000000000000000" http://localhost:3000/api/v1/forms
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | MySQL 8 / MariaDB 10.6+ connection string |
| `AUTH_SECRET` | ✅ | Auth.js JWT secret (`npx auth secret`) |
| `AUTH_TRUST_HOST` | ✅ behind proxies | Trust the forwarded host header |
| `NEXT_PUBLIC_APP_URL` | ✅ | Public origin for share links, QR codes and embed snippets |
| `BREVO_API_KEY` | optional | Deliver email through the Brevo transactional API |
| `MAILTRAP_API_KEY` | optional | Deliver email through the Mailtrap Email API |
| `MAILTRAP_USE_SANDBOX` + `MAILTRAP_INBOX_ID` | optional | Send to a Mailtrap test inbox instead of real recipients |
| `SMTP_URL` (or `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`) | optional | Deliver email through any SMTP server (Nodemailer) |
| `EMAIL_FROM` | optional | Sender, e.g. `Acme Forms <forms@acme.com>` (`NOTIFY_FROM_EMAIL` still honoured) |
| `EMAIL_PROVIDER` | optional | Force `brevo`, `mailtrap`, `smtp` or `log` when several are configured |
| `CRON_SECRET` | optional | Enables `POST /api/cron/automations`, which resumes due Delay nodes; call it from a scheduler with `Authorization: Bearer $CRON_SECRET`. In-process timers cover a single long-running server. |
| `ALLOW_PRIVATE_NETWORK_REQUESTS` | optional | `true` allows automation HTTP nodes and workspace SMTP servers to reach private/loopback addresses (blocked by default as SSRF protection) |
| `EMAIL_CREDENTIALS_KEY` | recommended in prod | ≥ 16 random chars. Key material for encrypting workspace email-provider credentials (falls back to `AUTH_SECRET`, so rotating `AUTH_SECRET` would make saved credentials unreadable without it) |
| `APP_FRAME_ANCESTORS` | optional | Extra origins allowed to frame the app (default: none) |

## Routes

**Public**
- `/` landing, `/login`, `/register`
- `/f/[slug]`: hosted form (password gate, schedule/cap, honeypot)
- `/embed/[slug]`: frameable form; posts `FORM_RESIZE` to the parent. Only `/embed/*` sends `frame-ancestors *`; every other route sends `DENY`.
- `/api/embed.js`: script embed (`data-formstudio-inline|popup|drawer`, launcher, and `DigitalFueled.open(slug)`; `FormStudio.open` is kept as an alias for existing embeds)
- `/api/public/forms/[slug]/{submit,events,unlock,slots}`. `slots?field=&date=` returns only the booked times for an appointment field with exclusive slots.

**Dashboard** (signed in)
- `/dashboard`: forms list
- `/dashboard/templates`: 8 templates with live preview (including Vendor KYC and Consultation Booking)
- `/dashboard/billing`: plan, usage, upgrade requests, owner contact
- `/dashboard/forms/[id]/edit`: 3‑pane builder (fields/outline/templates · canvas · field/validation/theme/settings inspector, versions, preview, publish)
- `/dashboard/forms/[id]/logic`: React Flow graph plus a synced rule editor
- `/dashboard/forms/[id]/share`: link, slug, QR (PNG/SVG), iframe/script/popup/drawer embeds
- `/dashboard/forms/[id]/submissions`: table with search, status and date filters, bulk actions, detail sheet with notes
- `/api/forms/[id]/export?format=csv|json`: export keyed by field key; honours the current filters
- `/dashboard/forms/[id]/analytics`: KPIs, 7/30/90‑day trend, funnel, devices, channels, referrers, per‑field breakdowns
- `/dashboard/forms/[id]/automations`: **Automation Studio** (see below)
- `/dashboard/developers`: **Developer portal** with API keys, playground, request logs, webhook delivery logs and API reference
- `/f/[slug]/receipt/[submissionId]?sig=…`: printable A4 receipt (HMAC-signed link)
- `/approvals/[runId]?token=…`: reviewer page for Approval-gate nodes
- `/dashboard/forms/[id]/integrations`: HMAC‑signed webhooks with test sends, delivery logs and redelivery

**Admin** (role `ADMIN`)
- `/admin`: overview with accounts, paid subscriptions, estimated MRR, 30‑day activity, plan mix, a "needs attention" queue (pending requests, expiring plans, failed automations, failing webhooks), API health and newest accounts
- `/admin/users`: segment filters with counts, sortable columns, usage bars, CSV export, `?q=` deep links; assign plans with expiry and notes, revoke, manage admin role
- `/admin/requests`: upgrade request queue; approve or decline atomically (compare‑and‑set)
- `/admin/settings`: plan limits and features editor, owner contact details
- `/admin/appearance`: workspace interface font (IBM Plex Sans, Inter, Geist or System UI), stored in `SystemSetting` under `ui.font`

## Webhook signatures

Every delivery sends `X-FormStudio-Signature: t=<unix>,v1=<hex>`. The `v1` value is `HMAC_SHA256(secret, "<t>.<raw body>")`. Events are `submission.created` and `webhook.test`. Endpoints must answer with a 2xx within 10 seconds.

## Form engine

- **Versions.** The builder edits a draft; publishing copies it to the live schema and records a `FormVersion`. Any version can be restored into the draft. Respondents never see unpublished edits.
- **One validator.** The client (react-hook-form) and the server (public submit and `POST /api/v1/forms/:id/submissions`) build the same zod schema from the published fields. The server rejects unknown fields, ignores values for fields hidden by logic, recomputes calculated fields, and enforces caps, schedules, the honeypot and a minimum fill time.
- **Calculated fields** use a sandboxed expression parser (no `eval`): `+ - * / % ^`, comparisons, and `round floor ceil abs min max sum avg clamp if sqrt`.
- **Save & Resume.** Respondents get a resume link. Only the SHA-256 of the token is stored.
- **Field library (v3).** Full name, address (per-country postal rules for IN/US/GB), country (ISO alpha‑2), phone with country code (libphonenumber), currency, slider, ranking, color, date & time, date range, appointment (slot window, weekdays, horizon; optional exclusive slots enforced with a 409 `slot_taken`), and video embeds. Short text has ID formats with checksums: PAN, GSTIN, Aadhaar (Verhoeff), IFSC, Indian PIN, US ZIP, UK postcode and IBAN (mod‑97). Email can reject consumer mailboxes, and date of birth supports min/max age.
- **Steps.** Step breaks are only offered in Stepper and Quiz forms (Card and Classic ignore them; the canvas offers a one-click "Remove breaks"). The step bar can add, rename, duplicate, reorder and delete a step. Deleting asks whether to remove the step's fields too or merge them into the previous step, and can be undone.
- **Fonts.** The theme font pickers list curated Google Fonts and accept any Google Fonts family name. Pro/Enterprise can upload up to two `.woff2/.woff/.ttf/.otf` files (≤ 400 KB each). They are embedded as `@font-face` data URLs, so they also work in embeds. Family names and data URLs are sanitised on save.
- **CSV export** prefixes cells starting with `= + - @` (and tab/CR) with `'` to prevent formula injection.

## Automation Studio

A per-form workflow canvas built with `@xyflow/react`. Graphs are validated as DAGs (no cycles, a single trigger, every node reachable, required config present) before they can be enabled.

| Kind | Nodes |
|---|---|
| Triggers | Form submitted · Quiz score threshold · Submission status changed · Manual/API |
| Logic | IF/ELSE router · Transform/Mapper · Delay · Approval gate (pauses the run in `WAITING_APPROVAL`, notifies reviewers and resumes on Approve/Reject) |
| Actions | HTTP request (headers, bearer/basic auth, HMAC signing, retries with backoff, response capture) · Send email (outbox) · Update submission (status, tags, notes) · Slack/Discord · In-app notification |

Config fields accept templates with a variable picker: `{{trigger.data.email}}`, `{{trigger.submission.id}}`, `{{nodes.http_1.body.id}}`. **Test run** executes the graph against sample or real submission data and shows per-node status, timing and JSON input/output. **Run history** lists every run with filters, step details and **Replay**.

## Developer API

- **Keys.** Created under `/dashboard/developers`. The raw key (`fs_live_…`) is shown once; only its 14-character prefix and SHA-256 hash are stored. Keys can have an expiry, a per-minute rate limit (DB-backed `RateLimitBucket`) and can be revoked.
- **Scopes:** `forms:read`, `forms:write`, `submissions:read`, `submissions:write`, `automations:trigger`, `analytics:read`.
- **OpenAPI 3.1 spec:** `GET /api/v1/openapi.json` (live, no auth).

| Method & path | Scope |
|---|---|
| `GET /api/v1/me` | any key |
| `GET, POST /api/v1/forms` | forms:read / forms:write |
| `GET, PATCH, DELETE /api/v1/forms/:id` | forms:read / forms:write |
| `POST /api/v1/forms/:id/publish` | forms:write |
| `GET, POST /api/v1/forms/:id/submissions` | submissions:read / submissions:write |
| `GET, PATCH, DELETE /api/v1/submissions/:id` | submissions:read / submissions:write |
| `GET /api/v1/forms/:id/analytics?days=30` | analytics:read |
| `GET /api/v1/forms/:id/automations` | forms:read |
| `POST /api/v1/automations/:id/trigger` | automations:trigger (202) |

`POST …/submissions` uses the same validator and plan limits as the hosted form, honours `Idempotency-Key` (24 h; replays return `Idempotent-Replayed: true`), and fires automations and webhooks. Errors share one shape: `{"error":{"code","message","details?"}}`. Lists return `{"object":"list","data","hasMore","nextCursor"}`.

## v4 — libraries, thank-you emails and typography

### Library-backed controls
Composite inputs now use established libraries instead of hand-rolled widgets (`components/renderer/field-control-pickers.tsx`):

| Control | Library |
|---|---|
| Phone with country code | `react-phone-number-input` (libphonenumber-js metadata, SVG flags from `country-flag-icons`) |
| Currency | `react-number-format` (Indian lakh grouping for INR) |
| Colour | `react-colorful` in a shadcn Popover |
| Slider | shadcn Slider (Radix) |
| Date, date & time, date range, appointment | shadcn Calendar (`react-day-picker`) + `date-fns` |
| Email templates | React Email (`@react-email/components`) |
| Email delivery | `@getbrevo/brevo`, `mailtrap` or `nodemailer` (SMTP) — see v5 |

Popovers portal into the form's `.fs-root`, and the `.fs-ui` class maps the shadcn tokens onto the form theme, so pickers follow each form's colours, radius and font. Stored value shapes are unchanged (phone stays `"+<dial> <national>"`, dates stay ISO), so the server validators and existing data keep working.

### Thank-you (auto-reply) emails
Builder → **Settings → Thank-you email**: turn it on, choose which Email field receives it, and edit the subject, heading and message. Every text supports merge tags: any `{{field_key}}`, plus `{{form_title}}`, `{{submission_id}}`, `{{submitted_at}}` (and `{{score}}`/`{{outcome}}` on quizzes). You can include a copy of the answers and set the sender name and Reply-To. **Send me a test email** sends the current draft, filled with sample answers, to your own address.

How a message is sent:

1. After a submission is stored, `runPostSubmit` builds the email (`lib/email/auto-reply.tsx`) and renders the React Email template (`lib/email/templates.tsx`) to HTML and plain text.
2. `sendEmail` (`lib/notify.ts`) writes the message to the `EmailOutbox` table first, then delivers it through the active provider (`lib/email/transport.ts`): Brevo, Mailtrap or SMTP — whichever is configured (see the v5 section) — otherwise it is only stored (`LOGGED`).
3. **Admin → Email** shows the active provider, the sent/stored/failed counts and every message, with a rendered preview.

Quick setups:

```bash
# Brevo: SMTP & API → API keys; verify the sender address or domain
BREVO_API_KEY=xkeysib-xxx
EMAIL_FROM="Acme Forms <forms@acme.com>"

# Gmail / Google Workspace: create an app password (2FA required)
SMTP_URL="smtps://you%40acme.com:app-password@smtp.gmail.com:465"
EMAIL_FROM="Acme Forms <you@acme.com>"
```

Forms saved before v4 that had a confirmation recipient keep sending receipts; the old default copy now uses the new template.

### UI
- Tabs have more room: the default tabs are taller with wider triggers, and the builder panels and Automation Studio use the underline variant.
- Marketing and auth pages use **Fraunces** (variable soft serif with optical sizing) for display type and **Instrument Sans** for text, in an editorial layout. The app UI keeps the admin-selectable interface font.


## v5 — Brevo & Mailtrap, migrations, the full Google Fonts catalogue, device previews

### Email providers
Resend has been removed. Delivery now goes through the official SDKs of **Brevo** (`@getbrevo/brevo`) and **Mailtrap** (`mailtrap`), or any SMTP server through Nodemailer. Selection lives in `lib/email/providers.ts` (pure and unit tested), and delivery lives in `lib/email/transport.ts`.

| Variable | Purpose |
|---|---|
| `BREVO_API_KEY` | Brevo transactional API key (`xkeysib-…`). The sender in `EMAIL_FROM` must be a verified sender or domain in Brevo. |
| `MAILTRAP_API_KEY` | Mailtrap API token. Live sending needs a verified sending domain. |
| `MAILTRAP_USE_SANDBOX=true` + `MAILTRAP_INBOX_ID` | Send to a Mailtrap **test inbox** instead of real people. `MAILTRAP_SANDBOX_ID` is accepted as an alias. |
| `EMAIL_PROVIDER` | `brevo`, `mailtrap`, `smtp` or `log`. It is used only if that provider is configured. |

If `EMAIL_PROVIDER` is not set, the order is Brevo → Mailtrap → SMTP → outbox only. Each outbox row stores the provider's message id, and Admin → Email shows it. The `receipt` / `notify` / `test` source is sent as a Brevo tag or Mailtrap category.

```bash
# Brevo
BREVO_API_KEY=xkeysib-xxx
EMAIL_FROM="Acme Forms <forms@acme.com>"

# Mailtrap sandbox (safe for staging)
MAILTRAP_API_KEY=xxxx
MAILTRAP_USE_SANDBOX=true
MAILTRAP_INBOX_ID=1234567
```

Brevo and Mailtrap also offer SMTP relays. Those work through `SMTP_URL` too.

### Database migrations
The schema is now managed with Prisma Migrate (`prisma/migrations`, baseline `20261124000000_init`). Every schema change must ship with a migration:

```bash
npx prisma migrate dev --name <change_name>   # or: npm run db:migrate -- --name <change_name>
npm run db:deploy                             # apply pending migrations (CI / production)
```

`prisma.config.ts` re-exports `prisma7.config.ts`, so a plain `npx prisma …` command finds the config. `npm run verify` and `npm run db:setup` use `prisma migrate deploy`. If a database was created earlier with `db push`, mark the baseline as applied once with `npx prisma migrate resolve --applied 20261124000000_init`.

### Fonts
The theme font picker lists the **entire Google Fonts catalogue**: 1,908 families including Funnel Display, Geologica and Bricolage Grotesque. The list is searchable, has category filters, is sorted by popularity, and shows each name previewed in its own typeface. The list comes from `google-font-metadata` (the Fontsource project's metadata), compacted into `lib/fonts/google-fonts.json` by `npm run fonts:generate`. Stylesheet URLs request only the weights a family really has, because Google rejects the whole request if any weight is missing. All 1,908 families have been checked against the CSS API. A family that isn't in the catalogue yet can still be typed in by name.

### Device previews
In the builder canvas and in Preview, Desktop, Tablet and Mobile are now separate simulated devices:

- **Desktop:** a browser window up to 1280 px wide.
- **Tablet:** an iPad-style frame at 768 × 1024.
- **Mobile:** a phone frame at 390 × 844.

Each screen is a container-query root, so the form lays out exactly as it would at that width. If the canvas is narrower than the tablet, the frame scales down (CSS zoom), and drag-and-drop compensates for the scale.

### Homepage
The homepage was redesigned after studying how product companies present themselves:

- **Linear and Attio:** the product as the hero, with real UI built in HTML instead of illustrations.
- **Stripe:** the value proposition as one plain sentence.
- **Attio:** an announcement pill.
- **Linear:** a bento grid of real product screens.
- **Stripe:** UI paired with code for developers.

Customer logos are replaced by the standards and services the product actually works with. The typography is **Funnel Display** (headlines) with **Funnel Sans** (text).

## v6 — teams, RBAC and bring-your-own email provider

### Workspaces & roles

Every form belongs to a **workspace**. Each account gets a personal workspace automatically and can create more or be invited into others; the sidebar header switches between them (the choice is a cookie that is only honoured while you are still a member).

| Role | Can |
|---|---|
| **Owner** (exactly one) | Everything, including deleting the workspace and transferring ownership. Billing owner: the workspace's forms count toward the owner's plan. |
| **Admin** | Every form at Manage level, invite/remove people (Editor & Member only), groups, email delivery settings, activity log. |
| **Editor** | Create forms (Manage on forms they created) plus whatever is assigned to them. |
| **Member** | Only forms assigned to them or their groups. |

### Assigning forms — per person or per group

Open a form → **Access** (or "People & access" in the forms list). Give one person, or a **group** such as "Support desk" or "Recruiting", one of four levels:

| Level | Allows |
|---|---|
| View | See the form and its responses, export |
| Review | + change response status, approve automation steps |
| Edit | + build, publish, share, delete responses, automations, webhooks |
| Manage | + delete the form and manage who has access |

The effective level is the highest of the direct and group grants. Groups are managed under **Team → Groups**, and invitations can drop new people straight into groups.

### Security model

- Every server action, page and API route re-resolves access from the database on each request (`lib/rbac/server.ts`); the UI hiding buttons is cosmetic only.
- Pure, unit-tested policy in `lib/rbac/policy.ts`. Escalation guards: nobody can change or remove the owner (transfer instead), nobody can change their own role, admins act only below themselves and can't create admins, and form access can't be granted above the granter's own level.
- No cross-tenant references: grantees, groups and invite groups are validated against the form's workspace. "Not found" and "no access" produce the same message (no existence oracle); the API returns 404 outside the key's workspace and 403 for an insufficient level.
- **Platform admins get no implicit access to customer workspaces.**
- API keys are bound to one workspace, and the key owner's membership is re-checked on every call. Removing someone revokes their keys for that workspace.
- Invitations: 192-bit random single-use tokens (only the SHA-256 is stored), 7-day expiry, accepted only by an account with the invited email, claimed atomically, rate limited.
- Every sensitive change (roles, invites, groups, access, email settings, ownership) is written to the **activity log** (Team → Activity).
- Sign-in `callbackUrl` only accepts same-origin paths (`lib/security/redirect.ts`).

### Bring your own email provider

**Settings → Email delivery** (Owner/Admin) connects the workspace's own **Brevo**, **Mailtrap** (sending or sandbox) or **SMTP** account. When it's on, thank-you emails, notifications, automation emails, approval requests, save-and-resume links and team invitations for that workspace use it. Account and billing emails always use the platform provider.

- Credentials are encrypted with AES-256-GCM (HKDF-derived key, workspace id as associated data, so a ciphertext copied to another workspace won't decrypt). They are decrypted only on the server at send time. The browser only sees the last four characters.
- Leave the secret blank when editing to keep the stored one.
- SMTP hosts are resolved once and must be public addresses. The connection goes to the vetted IP with TLS SNI set to the hostname, uses TLS 1.2+, and has timeouts (SSRF / DNS-rebinding protection).
- **Send test** delivers a real message to you. Failures appear on the page and in Admin → Email.

### New routes

| Route | Purpose |
|---|---|
| `/dashboard/team` | Members, roles, groups, invitations, activity |
| `/dashboard/settings` | Workspace name, new workspace, leave / delete |
| `/dashboard/settings/email` | Bring-your-own email provider |
| `/dashboard/forms/[id]/access` | Assign a form to people and groups |
| `/invite/[token]` | Accept an invitation |


## v7 — your own HTML email templates

Workspaces on **Pro / Enterprise** can replace the built-in email design with their own HTML, CSS and images. Templates belong to the workspace and are reusable by every form and automation in it.

### Where it's used

| Email | Pick the design in |
|---|---|
| Respondent thank-you (auto-reply) | Builder → Settings → Thank-you email → **Design** |
| New-response notification to the team | Builder → Settings → Notifications → **Notification design** |
| Automation "Send email" step | Automation Studio → email step → **Design** (the step's message is available as `{{email_body_html}}`) |

"Built-in design" stays the default. If a template is deleted, or the workspace's plan no longer includes custom emails, the email goes out in the built-in design instead of failing. The same happens if a template breaks at send time (the error is logged).

### Editor (Settings → Email templates)

- CodeMirror HTML editor with CSS highlighting inside `<style>`. You can import an existing `.html` file. Templates can be up to 200 KB.
- Live preview, rendered by the server exactly like a real send, with desktop, mobile and plain-text views. Use sample answers from any of your forms.
- Pick merge tags, block snippets and images from menus. Syntax errors give a line number and **Go to line**.
- Warnings for things email clients change: scripts, linked stylesheets, form controls, `data:` images, private or `http://` image URLs, background images, and emails over Gmail's 102 KB clipping limit.
- **Send test** sends the editor contents, with sample answers, to your inbox through the workspace's email provider. **Ctrl/⌘+S** saves.
- The default subject is used when a form's thank-you subject (or an automation's subject) is blank.

### Merge tags

`{{field_key}}` for any answer, plus `{{form_title}}`, `{{submission_id}}`, `{{submitted_at}}`, `{{answers_table}}` (a ready-made table), `{{receipt_url}}`, `{{dashboard_url}}`, `{{score}}`, `{{max_score}}`, `{{outcome}}`, `{{workspace_name}}`, and `{{email_body}}` / `{{email_body_html}}` in automations.

Blocks: `{{#if company}}…{{else}}…{{/if}}`, `{{#unless}}`, `{{#each answers}}{{label}}: {{value}}{{/each}}`, `{{#with}}`. Partials, helpers and decorators are rejected.

### Images

Gmail and most clients block embedded `data:` images, so images are hosted:

- Upload PNG, JPEG, GIF or WebP files (up to 2 MB each, 200 images or 50 MB per workspace). The real file type is checked from the file's contents, and SVG is not accepted.
- Uploaded images are served at `/api/assets/<id>/<name>` with `nosniff`, a deny-all CSP and long-lived caching.
- Inserted URLs use `NEXT_PUBLIC_APP_URL`, so set it to your public domain in production. Any public `https://` image URL works too.

### How a template is rendered (`lib/email/custom-template.ts`)

1. **Handlebars:**
   - Runs on an isolated instance with `knownHelpersOnly`.
   - An AST check allows only plain tags and the four built-in blocks.
   - Answers are HTML-escaped. Only `{{answers_table}}` / `{{email_body_html}}` are pre-built safe HTML.
   - Subjects are rendered as plain text.
2. **juice** inlines `<style>` rules into `style=""` attributes. Media queries and `@font-face` stay in a `<style>` block.
3. **sanitize-html** removes:
   - `<script>`, `on*` handlers, `iframe` / `object` / `embed`, forms and `<link>`.
   - `javascript:` links and any other non-`http(s)` / `mailto` / `tel` scheme, plus `data:` images.
   - Anything injected through a triple-stash `{{{tag}}}`.
4. **html-to-text** builds the plain-text alternative.

### Permissions

| | Owner / Admin / Editor | Member |
|---|---|---|
| View templates & images | ✓ | ✓ (read-only) |
| Create, edit, duplicate, delete, upload | ✓ | — |
| Choose a template for a form | needs **Edit** on the form | — |

Actions check workspace membership on the server. Template ids are only resolved inside the form's own workspace, so an id copied from another workspace is ignored. Creating, updating and deleting templates and images is recorded in the audit log.

### New routes and models

| Route | Purpose |
|---|---|
| `/dashboard/settings/email-templates` | Template gallery and image library |
| `/dashboard/settings/email-templates/[id]` | HTML editor with live preview |
| `/api/assets/[id]/[name]` | Public image hosting for emails |

New Prisma models: `EmailTemplate` and `WorkspaceAsset` (migration `20261125095659_email_templates`). The seed adds "Dana Demo Co. letter" to Dana's workspace and uses it for the Contact & Support thank-you email.
