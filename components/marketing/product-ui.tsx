import {
  AtSignIcon,
  BadgeCheckIcon,
  BanknoteIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  Clock3Icon,
  FileDigitIcon,
  GitBranchIcon,
  GripVerticalIcon,
  HashIcon,
  IdCardIcon,
  LandmarkIcon,
  MailIcon,
  PhoneIcon,
  SendIcon,
  ShieldCheckIcon,
  TypeIcon,
  UserCheckIcon,
  WebhookIcon,
  ZapIcon,
} from "lucide-react"

import { LogoMark } from "@/components/app/logo"
import { cn } from "@/lib/utils"

/*
 * Static, accessible renderings of real Digital Fueled screens — the builder,
 * a workflow run, the thank-you email, the slot picker and the responses
 * table — built in HTML so they stay sharp at any size (the Linear / Attio
 * "product as hero" pattern). The copy mirrors what the product really shows.
 */

function Dot({ className }: { className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", className)} aria-hidden />
}

/* ───────────────────────── Hero: the form builder ───────────────────────── */

const LIBRARY = [
  { group: "Identity", items: [
    { icon: IdCardIcon, label: "PAN" },
    { icon: LandmarkIcon, label: "GSTIN" },
    { icon: FileDigitIcon, label: "Aadhaar" },
    { icon: BanknoteIcon, label: "IFSC / IBAN" },
  ] },
  { group: "Contact", items: [
    { icon: AtSignIcon, label: "Email" },
    { icon: PhoneIcon, label: "Phone" },
    { icon: TypeIcon, label: "Full name" },
  ] },
  { group: "Scheduling", items: [{ icon: CalendarClockIcon, label: "Appointment" }] },
]

function Field({ label, value, hint, selected, valid, half, mono }: { label: string; value: string; hint?: string; selected?: boolean; valid?: boolean; half?: boolean; mono?: boolean }) {
  return (
    <div className={cn("relative rounded-md p-2", half ? "col-span-2 sm:col-span-1" : "col-span-2", selected && "bg-primary/[0.04] ring-1 ring-primary")}>
      {selected && (
        <>
          <GripVerticalIcon className="absolute top-2.5 -left-4 hidden size-3.5 text-primary sm:block" aria-hidden />
          <span className="absolute -top-2.5 right-2 rounded-sm bg-primary px-1.5 py-px text-[9.5px] font-medium text-primary-foreground">Selected</span>
        </>
      )}
      <p className="text-[11.5px] font-medium">
        {label} <span className="text-primary">*</span>
      </p>
      <div className={cn("mt-1 flex h-8 items-center justify-between gap-2 rounded-md border bg-background px-2.5 text-[12.5px]", valid && "border-emerald-600/40")}>
        <span className={cn("truncate", mono && "font-mono text-[12px] tracking-wide")}>{value}</span>
        {valid && <CheckIcon className="size-3.5 shrink-0 text-emerald-600" aria-hidden />}
      </div>
      {hint && <p className={cn("mt-1 text-[10.5px]", valid ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>{hint}</p>}
    </div>
  )
}

export function BuilderShowcase() {
  return (
    <figure className="relative" aria-label="The Digital Fueled form builder editing a vendor KYC form">
      <div className="overflow-hidden rounded-xl border border-foreground/15 bg-card">
        {/* window bar */}
        <div className="flex h-11 items-center gap-3 border-b bg-sidebar px-3 sm:px-4">
          <LogoMark className="size-[18px]" />
          <p className="min-w-0 truncate text-[12.5px]">
            <span className="text-muted-foreground">Forms /</span> <span className="font-medium">Vendor KYC onboarding</span>
          </p>
          <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground md:inline-flex">
            <Dot className="bg-emerald-500" /> Saved
          </span>
          <div className="mx-auto hidden rounded-md bg-muted p-0.5 text-[11.5px] lg:flex">
            {["Build", "Logic", "Workflow", "Results"].map((t, i) => (
              <span key={t} className={cn("rounded-[5px] px-3 py-1", i === 0 ? "bg-background font-medium" : "text-muted-foreground")}>
                {t}
              </span>
            ))}
          </div>
          <span className="ml-auto rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground lg:ml-0">Publish</span>
        </div>

        <div className="grid min-h-[27rem] grid-cols-1 md:grid-cols-[minmax(0,1fr)_15.5rem] lg:grid-cols-[12.5rem_minmax(0,1fr)_16rem]">
          {/* field library */}
          <aside className="hidden border-r bg-sidebar/60 p-3 lg:block" aria-label="Field library">
            <div className="flex h-7 items-center rounded-md border bg-background px-2 text-[11.5px] text-muted-foreground">Search 60+ fields…</div>
            {LIBRARY.map((g) => (
              <div key={g.group} className="mt-4">
                <p className="px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{g.group}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {g.items.map((it) => (
                    <li key={it.label} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]", it.label === "PAN" && "bg-background ring-1 ring-border")}>
                      <it.icon className="size-3.5 text-muted-foreground" aria-hidden />
                      {it.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </aside>

          {/* canvas */}
          <div className="bg-[oklch(0.975_0.006_80)] p-4 sm:p-7 dark:bg-muted/30">
            <div className="mx-auto max-w-[30rem] rounded-lg border bg-background p-5 sm:p-6">
              <ol className="flex items-center gap-2 text-[10.5px]" aria-label="Steps">
                {["Company", "Banking", "Review"].map((s, i) => (
                  <li key={s} className="flex flex-1 items-center gap-2">
                    <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-full text-[9.5px] font-semibold", i === 0 ? "bg-primary text-primary-foreground" : "border text-muted-foreground")}>{i + 1}</span>
                    <span className={cn(i === 0 ? "font-medium" : "text-muted-foreground")}>{s}</span>
                    {i < 2 && <span className="h-px flex-1 bg-border" />}
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-[17px] font-semibold tracking-tight">Vendor KYC onboarding</p>
              <p className="text-[12px] text-muted-foreground">Takes about 4 minutes. Your answers are saved as you go.</p>
              <div className="mt-4 grid grid-cols-2 gap-x-2 gap-y-1">
                <Field label="Legal entity name" value="Northwind Traders Pvt Ltd" />
                <Field label="GSTIN" value="27AAPFU0939F1ZV" mono valid hint="Valid · Maharashtra (27)" half />
                <Field label="PAN" value="ABCPE1234F" mono selected hint="Matches GSTIN characters 3–12" half />
                <Field label="Phone" value="🇮🇳  +91 98201 44120" half />
                <Field label="Annual turnover" value="₹ 2,40,00,000" half />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Step 1 of 3</span>
                <span className="rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground">Continue</span>
              </div>
            </div>
          </div>

          {/* inspector */}
          <aside className="hidden border-l p-4 md:block" aria-label="Field settings">
            <div className="flex items-center gap-4 border-b pb-2 text-[11.5px]">
              <span className="border-b-2 border-primary pb-1.5 font-medium">Field</span>
              <span className="pb-1.5 text-muted-foreground">Theme</span>
              <span className="pb-1.5 text-muted-foreground">Settings</span>
            </div>
            <dl className="mt-4 space-y-3.5 text-[11.5px]">
              <div>
                <dt className="text-muted-foreground">Label</dt>
                <dd className="mt-1 rounded-md border px-2 py-1.5">PAN</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Required</dt>
                <dd className="flex h-4 w-7 items-center justify-end rounded-full bg-primary p-0.5" aria-label="on">
                  <span className="size-3 rounded-full bg-primary-foreground" />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Format</dt>
                <dd className="mt-1 flex items-center justify-between rounded-md border px-2 py-1.5">
                  Indian PAN · AAAAA9999A <ChevronDownIcon className="size-3 text-muted-foreground" aria-hidden />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Width</dt>
                <dd className="mt-1 grid grid-cols-3 rounded-md bg-muted p-0.5 text-center text-[11px]">
                  <span className="py-0.5 text-muted-foreground">Full</span>
                  <span className="rounded-[5px] bg-background py-0.5 font-medium">Half</span>
                  <span className="py-0.5 text-muted-foreground">Third</span>
                </dd>
              </div>
              <div className="rounded-md border border-dashed p-2.5">
                <dt className="flex items-center gap-1.5 font-medium">
                  <GitBranchIcon className="size-3.5 text-primary" aria-hidden /> Logic
                </dt>
                <dd className="mt-1.5 leading-relaxed text-muted-foreground">
                  Show when <span className="rounded-sm bg-muted px-1 text-foreground">Country</span> is <span className="rounded-sm bg-muted px-1 text-foreground">India</span>
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>

      {/* workflow run, overlapping the window like a toast in the product */}
      <div className="relative mx-3 -mt-3 rounded-lg border border-foreground/15 bg-card p-3.5 sm:absolute sm:right-6 sm:-bottom-10 sm:mx-0 sm:mt-0 sm:w-[19rem] lg:-right-6">
        <div className="flex items-center gap-2 text-[11.5px]">
          <ZapIcon className="size-3.5 text-warm" aria-hidden />
          <span className="font-medium">Run #1042</span>
          <span className="text-muted-foreground">· KYC review</span>
          <span className="ml-auto rounded-sm bg-warm-soft px-1.5 py-px text-[10px] font-medium text-warm-foreground">Waiting</span>
        </div>
        <ol className="mt-3 space-y-2 text-[11.5px]">
          {[
            { icon: ShieldCheckIcon, t: "Validated on the server", m: "14 ms", done: true },
            { icon: GitBranchIcon, t: "Turnover above ₹1 Cr → Finance", m: "2 ms", done: true },
            { icon: UserCheckIcon, t: "Approval from Priya (Finance)", m: "pending", done: false },
            { icon: WebhookIcon, t: "Signed webhook to ERP", m: "queued", done: false },
          ].map((s) => (
            <li key={s.t} className="flex items-center gap-2">
              {s.done ? <CheckIcon className="size-3.5 text-emerald-600" aria-hidden /> : <CircleDashedIcon className="size-3.5 text-muted-foreground" aria-hidden />}
              <span className={cn(!s.done && "text-muted-foreground")}>{s.t}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{s.m}</span>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  )
}

/* ───────────────────────────── Bento tiles ───────────────────────────── */

export function WorkflowTile() {
  const node = "rounded-md border bg-background px-3 py-2 text-[11.5px]"
  return (
    <div className="relative h-full min-h-56 overflow-hidden rounded-md border bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:14px_14px] p-4" aria-hidden>
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div className={node}>
          <p className="flex items-center gap-1.5 font-medium"><SendIcon className="size-3 text-primary" /> Form submitted</p>
          <p className="text-[10px] text-muted-foreground">Expense claim</p>
        </div>
        <span className="mx-auto h-3 w-px bg-foreground/30 sm:h-px sm:w-4" />
        <div className={node}>
          <p className="flex items-center gap-1.5 font-medium"><GitBranchIcon className="size-3 text-primary" /> If amount</p>
          <p className="text-[10px] text-muted-foreground">&gt; ₹50,000</p>
        </div>
        <span className="mx-auto h-3 w-px bg-foreground/30 sm:h-px sm:w-4" />
        <div className={cn(node, "border-warm")}>
          <p className="flex items-center gap-1.5 font-medium"><UserCheckIcon className="size-3 text-warm" /> Approval</p>
          <p className="text-[10px] text-muted-foreground">Finance lead</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { icon: MailIcon, t: "Email requester", s: "Brevo" },
          { icon: HashIcon, t: "Post to Slack", s: "#finance-ops" },
          { icon: WebhookIcon, t: "HTTP request", s: "HMAC signed" },
        ].map((n) => (
          <div key={n.t} className={node}>
            <p className="flex items-center gap-1.5 font-medium"><n.icon className="size-3 text-muted-foreground" /> {n.t}</p>
            <p className="text-[10px] text-muted-foreground">{n.s}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5 text-[10px]">
        {["Succeeded 1,284", "Waiting approval 6", "Failed 2 · retry"].map((c, i) => (
          <span key={c} className={cn("rounded-sm border bg-background px-1.5 py-0.5", i === 1 && "border-warm/60 text-warm-foreground", i === 2 && "text-destructive")}>
            {c}
          </span>
        ))}
      </div>
    </div>
  )
}

export function ValidationTile() {
  return (
    <div className="space-y-2.5 rounded-md border bg-background p-4 text-[12px]" aria-hidden>
      {[
        { l: "GSTIN", v: "27AAPFU0939F1ZV", ok: true, m: "Checksum valid" },
        { l: "IFSC", v: "HDFC0000123", ok: true, m: "HDFC Bank" },
        { l: "Aadhaar", v: "2345 6789 0125", ok: false, m: "Verhoeff check failed" },
      ].map((f) => (
        <div key={f.l}>
          <p className="text-[11px] font-medium">{f.l}</p>
          <div className={cn("mt-1 flex h-8 items-center justify-between rounded-md border px-2.5 font-mono text-[11.5px]", f.ok ? "border-emerald-600/40" : "border-destructive/60")}>
            {f.v}
            {f.ok ? <CheckIcon className="size-3.5 text-emerald-600" /> : <span className="text-destructive">!</span>}
          </div>
          <p className={cn("mt-0.5 text-[10.5px]", f.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>{f.m}</p>
        </div>
      ))}
    </div>
  )
}

export function EmailTile() {
  const tag = "rounded-sm border border-primary/30 bg-primary/[0.06] px-1 font-mono text-[10.5px] text-primary"
  return (
    <div className="rounded-md border bg-background text-[12px]" aria-hidden>
      <div className="flex items-center gap-2 border-b px-3.5 py-2 text-[11px] text-muted-foreground">
        <MailIcon className="size-3.5" /> Thank-you email
        <span className="ml-auto rounded-sm bg-muted px-1.5 py-px">via Mailtrap</span>
      </div>
      <div className="space-y-2 p-4 leading-relaxed">
        <p className="font-semibold">Thanks, <span className={tag}>{"{{first_name}}"}</span> — we have your application</p>
        <p className="text-muted-foreground">
          Reference <span className={tag}>{"{{submission_id}}"}</span>. Our team reviews KYC within two working days and will reply to this address.
        </p>
        <div className="rounded-md bg-muted/60 p-2.5 text-[11px]">
          <p className="flex justify-between"><span className="text-muted-foreground">Legal entity</span> Northwind Traders</p>
          <p className="flex justify-between"><span className="text-muted-foreground">GSTIN</span> <span className="font-mono">27AAPFU0939F1ZV</span></p>
        </div>
      </div>
    </div>
  )
}

export function SlotsTile() {
  const slots = ["09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "16:30"]
  return (
    <div className="rounded-md border bg-background p-4 text-[12px]" aria-hidden>
      <div className="flex items-center justify-between">
        <p className="font-medium">Thu, 26 Nov</p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3Icon className="size-3" /> 30 min · IST</p>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {slots.map((s, i) => (
          <span
            key={s}
            className={cn(
              "rounded-md border py-1.5 text-center tabular-nums",
              i === 2 && "border-primary bg-primary text-primary-foreground",
              (i === 1 || i === 5) && "text-muted-foreground line-through decoration-foreground/40"
            )}
          >
            {s}
          </span>
        ))}
      </div>
      <p className="mt-3 rounded-md bg-warm-soft px-2.5 py-1.5 text-[11px] text-warm-foreground">10:00 was just booked by someone else. Pick another time.</p>
    </div>
  )
}

export function ResponsesTile() {
  const rows = [
    { n: "Aarav Mehta", f: "Vendor KYC", s: "New", score: "—", c: "bg-primary" },
    { n: "Sara Khan", f: "Expense claim", s: "Reviewed", score: "₹ 18,400", c: "bg-emerald-500" },
    { n: "Liam O’Neill", f: "Site inspection", s: "Flagged", score: "3 issues", c: "bg-warm" },
    { n: "Meera Iyer", f: "Job application", s: "New", score: "82 / 100", c: "bg-primary" },
  ]
  return (
    <div className="overflow-hidden rounded-md border bg-background text-[12px]" aria-hidden>
      <div className="grid grid-cols-[1.2fr_0.9fr_0.8fr] border-b bg-muted/50 sm:grid-cols-[1.2fr_1fr_0.8fr_0.8fr] px-3.5 py-2 text-[10.5px] font-medium text-muted-foreground">
        <span>Respondent</span>
        <span className="hidden sm:block">Form</span>
        <span>Status</span>
        <span className="text-right">Value</span>
      </div>
      {rows.map((r) => (
        <div key={r.n} className="grid grid-cols-[1.2fr_0.9fr_0.8fr] items-center border-b sm:grid-cols-[1.2fr_1fr_0.8fr_0.8fr] px-3.5 py-2 last:border-0">
          <span className="truncate font-medium">{r.n}</span>
          <span className="hidden truncate text-muted-foreground sm:block">{r.f}</span>
          <span className="flex items-center gap-1.5"><Dot className={r.c} /> {r.s}</span>
          <span className="text-right tabular-nums">{r.score}</span>
        </div>
      ))}
    </div>
  )
}

export function ApiKeyTile() {
  return (
    <div className="space-y-2 rounded-md border bg-background p-4 text-[12px]" aria-hidden>
      <div className="flex items-center justify-between">
        <p className="font-medium">ERP sync</p>
        <span className="flex items-center gap-1 text-[10.5px] text-emerald-700 dark:text-emerald-400"><BadgeCheckIcon className="size-3" /> Active</span>
      </div>
      <p className="rounded-md bg-muted px-2 py-1.5 font-mono text-[11px]">fs_live_7Hq2••••••••••••rX0a</p>
      <div className="flex flex-wrap gap-1">
        {["forms:read", "submissions:read", "submissions:write"].map((s) => (
          <span key={s} className="rounded-sm border px-1.5 py-px font-mono text-[10px]">{s}</span>
        ))}
      </div>
      <p className="text-[10.5px] text-muted-foreground">120 requests / min · last used 2 min ago</p>
    </div>
  )
}
