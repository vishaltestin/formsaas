import Link from "next/link"
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BracesIcon,
  CheckIcon,
  FileCheck2Icon,
  FingerprintIcon,
  HistoryIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
} from "lucide-react"

import { Logo } from "@/components/app/logo"
import { HeroSandbox } from "@/components/marketing/hero-sandbox"
import { ApiKeyTile, BuilderShowcase, EmailTile, ResponsesTile, SlotsTile, ValidationTile, WorkflowTile } from "@/components/marketing/product-ui"
import { Button } from "@/components/ui/button"
import { getOwnerContact } from "@/lib/entitlements"
import { COUNTRIES, FIELD_TYPES, FORM_MODES } from "@/lib/form-engine"
import { FEATURE_LABELS, formatLimit, normalizeFeatures, normalizeLimits, type PlanFeatures } from "@/lib/plans"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/session"

const CONTROLS = [
  { icon: ShieldCheckIcon, title: "Server-side enforcement", body: "Unknown fields are rejected, hidden fields are discarded and calculated values are recomputed before anything is stored." },
  { icon: KeyRoundIcon, title: "Scoped, hashed API keys", body: "Keys are shown once, stored as SHA-256 hashes, limited to the scopes you grant and revocable instantly." },
  { icon: FingerprintIcon, title: "Signed deliveries", body: "Webhooks and workflow calls carry a timestamped HMAC signature so receivers can verify origin and freshness." },
  { icon: FileCheck2Icon, title: "Verifiable receipts", body: "Respondents get a printable receipt with a signature that can be checked later." },
  { icon: HistoryIcon, title: "Versions and run history", body: "Every publish is a restorable snapshot, and every workflow run logs inputs, outputs and timings per step." },
  { icon: LockKeyholeIcon, title: "Export hygiene", body: "CSV exports neutralise spreadsheet formulas, and admin roles control who can change plans and limits." },
]

/** Standards and services the product really speaks — shown instead of borrowed customer logos. */
const WORKS_WITH = ["OpenAPI 3.1", "HMAC-SHA256 webhooks", "Brevo", "Mailtrap", "Any SMTP", "Slack", "Discord", "CSV export", "Embed script"]

function priceParts(label: string) {
  const m = /^(\D*?)([\d,.]+)(.*)$/.exec(label.trim())
  return m ? { amount: `${m[1]}${m[2]}`, unit: m[3].trim() } : { amount: label, unit: "" }
}

function Tile({ className, kicker, title, body, children }: { className?: string; kicker: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <article className={`flex min-w-0 flex-col gap-5 bg-card p-5 sm:p-6 ${className ?? ""}`}>
      <div>
        <p className="text-[12.5px] font-medium text-primary">{kicker}</p>
        <h3 className="mk-heading mt-1.5 text-[1.4rem]">{title}</h3>
        <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="mt-auto">{children}</div>
    </article>
  )
}

export default async function Home() {
  const [user, plans, contact] = await Promise.all([
    getSessionUser(),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }).catch(() => []),
    getOwnerContact().catch(() => null),
  ])
  const inputTypes = FIELD_TYPES.filter((t) => !["heading", "paragraph", "divider", "image", "video", "step_break"].includes(t)).length
  const salesHref = contact?.ownerBookingUrl || (contact?.ownerEmail ? `mailto:${contact.ownerEmail}?subject=${encodeURIComponent("Digital Fueled demo")}` : "/register")
  const primaryHref = user ? "/dashboard" : "/register"

  return (
    <div className="marketing min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-[76rem] items-center gap-9 px-5 sm:px-8">
          <Link href="/" aria-label="Digital Fueled home">
            <Logo className="text-[15px]" />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-7 text-[14px] md:flex">
            {[
              ["#product", "Product"],
              ["#workflows", "Workflows"],
              ["#developers", "Developers"],
              ["#security", "Security"],
              ["#pricing", "Pricing"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="text-foreground/70 transition-colors hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <Button asChild size="sm" className="h-9 px-4">
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="h-9">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm" className="h-9 px-4">
                  <Link href="/register">Start free</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero: headline + the product itself ───────────────── */}
        <section className="overflow-hidden">
          <div className="mx-auto max-w-[76rem] px-5 pt-14 sm:px-8 md:pt-20">
            <Link
              href={primaryHref}
              className="group inline-flex items-center gap-2.5 rounded-full border bg-card py-1 pr-3 pl-1 text-[13px] transition-colors hover:border-foreground/30"
            >
              <span className="rounded-full bg-warm-soft px-2 py-0.5 text-[11.5px] font-medium text-warm-foreground">New</span>
              Thank-you emails through Brevo or Mailtrap
              <ArrowRightIcon className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
              <h1 className="mk-display max-w-[17ch] text-[clamp(2.6rem,6.4vw,5.1rem)] text-balance">
                The form platform for teams that can’t afford <span className="text-primary">bad data.</span>
              </h1>
              <div>
                <p className="text-[16.5px] leading-relaxed text-pretty text-muted-foreground">
                  Build multi-step forms with real ID and banking checks, route every response through approvals, and connect it all over a REST API.
                </p>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  <Button asChild size="lg" className="h-11 px-5 text-[14.5px]">
                    <Link href={primaryHref}>
                      {user ? "Go to your forms" : "Start building free"} <ArrowRightIcon data-icon="inline-end" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-11 px-5 text-[14.5px]">
                    <a href={salesHref}>Talk to sales</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-14 max-w-[76rem] px-3 pb-20 sm:px-8 md:mt-16">
            <BuilderShowcase />
          </div>
        </section>

        {/* ── Works with ───────────────────────────────────────── */}
        <section className="border-y bg-sidebar">
          <div className="mx-auto flex max-w-[76rem] flex-col gap-4 px-5 py-6 sm:px-8 md:flex-row md:items-center md:gap-10">
            <p className="shrink-0 text-[13px] text-muted-foreground">Works with your stack</p>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] font-medium text-foreground/75 xl:gap-x-7">
              {WORKS_WITH.map((w) => (
                <li key={w} className="whitespace-nowrap">{w}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Bento: real screens ──────────────────────────────── */}
        <section id="product" className="scroll-mt-16">
          <div className="mx-auto max-w-[76rem] px-5 py-24 sm:px-8">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-end">
              <h2 className="mk-heading max-w-[20ch] text-[clamp(2rem,4vw,3.25rem)] text-balance">
                Everything between the first field and the final approval.
              </h2>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                {inputTypes} input types, {FORM_MODES.length} layouts and {COUNTRIES.length} countries of phone and postal rules — validated in the browser and again on the server.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-6">
              <Tile
                className="md:col-span-4"
                kicker="Workflows"
                title="Route every response without a developer"
                body="Branch on answers, wait for a manager, then email, post to Slack or call your systems. Every run is logged step by step."
              >
                <WorkflowTile />
              </Tile>
              <Tile className="md:col-span-2" kicker="Validation" title="Checks that know the format" body="GSTIN, PAN, Aadhaar, IFSC and IBAN with real checksums.">
                <ValidationTile />
              </Tile>
              <Tile className="md:col-span-3" kicker="Thank-you emails" title="A reply in their inbox, in your words" body="Merge any answer into the subject and body. Sent through Brevo, Mailtrap or SMTP, with an outbox you can audit.">
                <EmailTile />
              </Tile>
              <Tile className="md:col-span-3" kicker="Scheduling" title="Appointment slots that can’t double-book" body="Capacity is checked inside the database transaction, so two people can never take the same time.">
                <SlotsTile />
              </Tile>
              <Tile className="md:col-span-4" kicker="Responses" title="One inbox for every form" body="Filter, review, flag and export. Quiz scores and calculated totals are recomputed on the server.">
                <ResponsesTile />
              </Tile>
              <Tile className="md:col-span-2" kicker="Access" title="Keys scoped to the job" body="Per-key scopes, rate limits and request logs.">
                <ApiKeyTile />
              </Tile>
            </div>
          </div>
        </section>

        {/* ── Try it ───────────────────────────────────────────── */}
        <section id="workflows" className="scroll-mt-16 border-y bg-sidebar">
          <div className="mx-auto max-w-[76rem] px-5 py-24 sm:px-8">
            <div className="mb-10 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-end">
              <div>
                <p className="text-[13px] font-medium text-primary">Try it here</p>
                <h2 className="mk-heading mt-2 max-w-[22ch] text-[clamp(2rem,4vw,3.25rem)] text-balance">One form, four layouts, the same rules underneath.</h2>
              </div>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                Switch the layout and enter a team size above 50. The logic rule, the server validation and the workflow below react exactly as they would live. Nothing is sent.
              </p>
            </div>
            <HeroSandbox />
          </div>
        </section>

        {/* ── Developers: UI paired with code (Stripe) ─────────── */}
        <section id="developers" className="scroll-mt-16">
          <div className="mx-auto grid max-w-[76rem] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
            <div>
              <p className="text-[13px] font-medium text-primary">Developer API</p>
              <h2 className="mk-heading mt-2 text-[clamp(2rem,4vw,3.25rem)] text-balance">An API your engineers will actually like.</h2>
              <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-muted-foreground">
                Create forms, pull responses and trigger workflows over REST. Errors share one shape, lists use cursors, and a retry with the same idempotency key never creates a second record.
              </p>
              <ul className="mt-7 grid gap-2.5 text-[14px] sm:grid-cols-2">
                {["OpenAPI 3.1 specification", "Idempotent writes for 24 hours", "Signed webhooks with timestamps", "Interactive playground"].map((p) => (
                  <li key={p} className="flex items-center gap-2">
                    <CheckIcon className="size-4 text-primary" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <a href="/api/v1/openapi.json">
                    <BracesIcon /> OpenAPI spec
                  </a>
                </Button>
                <Button asChild variant="ghost">
                  <Link href={user ? "/dashboard/developers" : "/login"}>
                    Open the playground <ArrowUpRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border bg-[oklch(0.22_0.03_262)] text-[oklch(0.93_0.01_262)]">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 font-mono text-[11.5px] text-white/60">
                <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">POST</span>
                /api/v1/forms/:id/submissions
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed">
                <code>
                  <span className="text-white/50">curl</span> -X POST $DF_URL/api/v1/forms/frm_8x2/submissions \{"\n"}
                  {"  "}-H <span className="text-[oklch(0.8_0.1_250)]">&quot;Authorization: Bearer $DF_API_KEY&quot;</span> \{"\n"}
                  {"  "}-H <span className="text-[oklch(0.8_0.1_250)]">&quot;Idempotency-Key: order-1042&quot;</span> \{"\n"}
                  {"  "}-d <span className="text-warm">&apos;{"{"}&quot;data&quot;:{"{"}&quot;email&quot;:&quot;ops@acme.in&quot;,&quot;gstin&quot;:&quot;27AAPFU0939F1ZV&quot;{"}}"}&apos;</span>
                </code>
              </pre>
              <div className="border-t border-white/10" />
              <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-white/65">
                <code>{`201 Created
{
  "data": {
    "id": "sub_9x2k",
    "status": "NEW",
    "formId": "frm_8x2"
  }
}`}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Security ─────────────────────────────────────────── */}
        <section id="security" className="scroll-mt-16 border-t">
          <div className="mx-auto grid max-w-[76rem] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <p className="text-[13px] font-medium text-primary">Security &amp; governance</p>
              <h2 className="mk-heading mt-2 text-[clamp(2rem,4vw,3.25rem)] text-balance">Controls your security review will ask about.</h2>
              <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted-foreground">Enforced by the platform itself, not left to configuration.</p>
            </div>
            <dl className="grid gap-x-10 sm:grid-cols-2">
              {CONTROLS.map((c) => (
                <div key={c.title} className="border-t py-6">
                  <dt className="flex items-center gap-2.5 text-[15px] font-medium">
                    <c.icon className="size-4 text-primary" aria-hidden />
                    {c.title}
                  </dt>
                  <dd className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{c.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────── */}
        {plans.length > 0 && (
          <section id="pricing" className="scroll-mt-16 border-t bg-sidebar">
            <div className="mx-auto max-w-[76rem] px-5 py-24 sm:px-8">
              <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-end">
                <h2 className="mk-heading text-[clamp(2rem,4vw,3.25rem)] text-balance">Start free. Pay when the forms are doing real work.</h2>
                <p className="text-[15px] leading-relaxed text-muted-foreground">Every plan includes server-side validation, the REST API and thank-you emails.</p>
              </div>
              <div className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3">
                {plans.map((p, i) => {
                  const limits = normalizeLimits(p.limits)
                  const features = normalizeFeatures(p.features)
                  const price = priceParts(p.priceLabel)
                  const featured = i === 1
                  return (
                    <div key={p.id} className="relative flex flex-col bg-card p-7">
                      {featured && <span className="absolute inset-x-0 top-0 h-[3px] bg-warm" aria-hidden />}
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-[15px] font-semibold">{p.name}</h3>
                        {featured && <span className="rounded-full bg-warm-soft px-2 py-0.5 text-[11.5px] font-medium text-warm-foreground">Most teams</span>}
                      </div>
                      <p className="mt-5 flex items-baseline gap-1.5">
                        <span className="mk-numeral text-5xl">{price.amount}</span>
                        {price.unit && <span className="text-sm text-muted-foreground">{price.unit}</span>}
                      </p>
                      {p.description && <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>}
                      <Button asChild className="mt-6 h-10" variant={featured ? "default" : "outline"}>
                        {/^\D*0(\D|$)/.test(p.priceLabel) || p.slug === "free" ? (
                          <Link href={primaryHref}>Start free</Link>
                        ) : /\d/.test(p.priceLabel) ? (
                          <Link href={user ? "/dashboard/billing" : "/register"}>Choose {p.name}</Link>
                        ) : (
                          <a href={salesHref}>Talk to sales</a>
                        )}
                      </Button>
                      <ul className="mt-7 space-y-2.5 text-[14px]">
                        <li className="flex gap-2.5">
                          <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                          {formatLimit(limits.maxForms)} forms · {formatLimit(limits.monthlySubmissions)} responses / month
                        </li>
                        {(Object.keys(FEATURE_LABELS) as (keyof PlanFeatures)[])
                          .filter((k) => features[k])
                          .map((k) => (
                            <li key={k} className="flex gap-2.5">
                              <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                              {FEATURE_LABELS[k]}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── Closing CTA ──────────────────────────────────────── */}
        <section className="border-t">
          <div className="mx-auto flex max-w-[76rem] flex-col gap-8 px-5 py-20 sm:px-8 md:flex-row md:items-end md:justify-between">
            <h2 className="mk-display max-w-[16ch] text-[clamp(2.25rem,5vw,4rem)] text-balance">
              Replace the spreadsheet chase this week.
            </h2>
            <div className="flex flex-wrap gap-2.5">
              <Button asChild size="lg" className="h-11 px-5">
                <Link href={primaryHref}>
                  {user ? "Open dashboard" : "Create your workspace"} <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5">
                <Link href="/f/lead-qualification">See a live form</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-sidebar">
        <div className="mx-auto grid max-w-[76rem] gap-10 px-5 pt-14 pb-10 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">Validated forms, approval workflows and a developer API for operations-heavy teams.</p>
          </div>
          {[
            { h: "Product", l: [["#product", "Product"], ["#security", "Security"], ["#pricing", "Pricing"]] },
            { h: "Developers", l: [["/api/v1/openapi.json", "OpenAPI spec"], ["/dashboard/developers", "API keys"], ["/api/embed.js", "Embed script"]] },
            { h: "Account", l: [["/login", "Sign in"], ["/register", "Create account"], [salesHref, "Contact sales"]] },
          ].map((col) => (
            <div key={col.h}>
              <p className="text-[13px] font-medium">{col.h}</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {col.l.map(([href, label]) => (
                  <li key={label}>
                    <a href={href} className="hover:text-foreground">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t">
          <div className="mx-auto flex max-w-[76rem] flex-wrap items-center justify-between gap-2 px-5 py-5 text-xs text-muted-foreground sm:px-8">
            <span>© {new Date().getFullYear()} Digital Fueled. All rights reserved.</span>
            <span>Forms · Workflows · API</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
