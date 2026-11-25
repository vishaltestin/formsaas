"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  BracesIcon,
  CodeXmlIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { sendTestAutoReply } from "@/app/actions/email"
import { setFormPassword } from "@/app/actions/forms"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  hasScoring,
  isInputField,
  maxScore,
  uid,
  type AutoReplySettings,
  type FormMode,
  type FormSchema,
  type FormSettings,
  type QuizOutcome,
} from "@/lib/form-engine"

import {
  LockedNotice,
  NumberInput,
  Row,
  SectionTitle,
  SwitchRow,
} from "./inspector-controls"

const MAIL_TOKENS = [
  { token: "{{form_title}}", label: "Form title" },
  { token: "{{submission_id}}", label: "Reference number" },
  { token: "{{submitted_at}}", label: "Submitted at" },
]

export interface EmailTemplateOptions {
  options: { id: string; name: string }[]
  allowed: boolean
  canManage: boolean
}

const BUILT_IN = "__builtin"

/** "Built-in design" or one of the workspace's own HTML templates. */
function EmailDesignPicker({
  id,
  label,
  value,
  templates,
  onChange,
}: {
  id: string
  label: string
  value: string | null
  templates: EmailTemplateOptions
  onChange: (id: string | null) => void
}) {
  const selected = templates.options.find((t) => t.id === value)
  const missing = !!value && !selected
  if (!templates.allowed) {
    return (
      <Row label={label}>
        <div className="flex items-start gap-2 rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Built-in design. Your own HTML templates with custom images and
            styles are available on Pro and Enterprise.
          </span>
        </div>
      </Row>
    )
  }
  return (
    <Row label={label} htmlFor={id}>
      <Select
        value={selected ? selected.id : BUILT_IN}
        onValueChange={(v) => onChange(v === BUILT_IN ? null : v)}
      >
        <SelectTrigger id={id} size="sm" className="w-full" data-testid={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={BUILT_IN}>Built-in design</SelectItem>
          {templates.options.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              <CodeXmlIcon className="size-3.5" /> {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {missing && (
          <span className="text-destructive">
            The selected template was deleted — the built-in design is used.
          </span>
        )}
        {selected ? (
          <Link
            href={`/dashboard/settings/email-templates/${selected.id}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Edit “{selected.name}” <ExternalLinkIcon className="size-3" />
          </Link>
        ) : templates.canManage ? (
          <Link
            href="/dashboard/settings/email-templates"
            target="_blank"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {templates.options.length
              ? "Manage HTML templates"
              : "Create your own HTML template"}{" "}
            <ExternalLinkIcon className="size-3" />
          </Link>
        ) : null}
      </div>
    </Row>
  )
}

const appendToken = (text: string, token: string) =>
  `${text}${text.endsWith(" ") || text.endsWith("\n") || !text ? "" : " "}${token}`

function toLocalInput(iso?: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

function PipingPicker({
  schema,
  onInsert,
  extraTokens = [],
}: {
  schema: FormSchema
  onInsert: (token: string) => void
  extraTokens?: { token: string; label: string }[]
}) {
  const tokens = schema.fields
    .filter(isInputField)
    .map((f) => ({ token: `{{${f.key}}}`, label: f.label }))
  const scoring = hasScoring(schema)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs text-muted-foreground"
        >
          <BracesIcon className="size-3" /> Insert answer
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <PopoverHeader className="border-b p-3">
          <PopoverTitle className="text-sm">Answer piping</PopoverTitle>
          <PopoverDescription className="text-xs">
            Tokens are replaced with the respondent’s answers.
          </PopoverDescription>
        </PopoverHeader>
        <div className="max-h-64 overflow-y-auto p-1">
          {[
            ...extraTokens,
            ...tokens,
            ...(scoring
              ? [
                  { token: "{{score}}", label: "Score" },
                  { token: "{{maxScore}}", label: "Max score" },
                  { token: "{{outcome}}", label: "Outcome title" },
                ]
              : []),
          ].map((t) => (
            <button
              key={t.token}
              type="button"
              onClick={() => onInsert(t.token)}
              className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className="truncate">{t.label}</span>
              <code className="shrink-0 text-muted-foreground">{t.token}</code>
            </button>
          ))}
          {tokens.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              Add questions to pipe their answers.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function SettingsInspector({
  formId,
  mode,
  schema,
  settings,
  features,
  emailTemplates = { options: [], allowed: false, canManage: false },
  onSettings,
  onSchema,
}: {
  formId: string
  mode: FormMode
  schema: FormSchema
  settings: FormSettings
  features: { webhooks: boolean; removeBadge: boolean }
  emailTemplates?: EmailTemplateOptions
  onSettings: (patch: Partial<FormSettings>, key?: string) => void
  onSchema: (updater: (s: FormSchema) => FormSchema, key?: string) => void
}) {
  const [password, setPassword] = useState("")
  const [pending, start] = useTransition()
  const [testing, startTest] = useTransition()
  const autoReply = settings.autoReply
  const setAutoReply = (patch: Partial<AutoReplySettings>, key?: string) =>
    onSettings({ autoReply: { ...autoReply, ...patch } }, key)
  const sendTest = () =>
    startTest(async () => {
      const res = await sendTestAutoReply(formId, autoReply)
      if (!res.ok) return void toast.error(res.error)
      const { provider, label, to, sent, error, template } = res.data
      if (autoReply.templateId && !template)
        toast.warning(
          "The selected template couldn't be used — the test went out with the built-in design."
        )
      if (provider === "log")
        toast.info(`Saved to the outbox for ${to}`, {
          description:
            "No email provider is configured. Set BREVO_API_KEY or MAILTRAP_API_KEY to deliver for real.",
        })
      else if (sent)
        toast.success(`Test email sent to ${to}`, {
          description: `Delivered via ${label}.`,
        })
      else
        toast.error("The provider rejected the email", { description: error })
    })
  const emailFields = schema.fields.filter((f) => f.type === "email")
  const replyTemplate = emailTemplates.allowed
    ? emailTemplates.options.find((t) => t.id === autoReply.templateId)
    : undefined
  const stepped = mode === "STEPPER" || mode === "QUIZ"
  const scoring = mode === "QUIZ" || hasScoring(schema)

  const savePassword = (value: string | null) =>
    start(async () => {
      const res = await setFormPassword(formId, value)
      if (!res.ok) return void toast.error(res.error)
      onSettings({ passwordEnabled: !!value })
      setPassword("")
      toast.success(value ? "Password protection enabled" : "Password removed")
    })

  const setOutcome = (idx: number, patch: Partial<QuizOutcome>) =>
    onSchema(
      (s) => ({
        ...s,
        quiz: {
          ...s.quiz,
          outcomes: s.quiz.outcomes.map((o, i) =>
            i === idx ? { ...o, ...patch } : o
          ),
        },
      }),
      `outcome-${idx}`
    )

  return (
    <Accordion type="multiple" defaultValue={["ending"]} className="px-4">
      <AccordionItem value="ending">
        <AccordionTrigger className="text-sm hover:no-underline">
          Thank-you screen
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <Row label="Title" htmlFor="st-title">
            <Input
              id="st-title"
              className="h-8"
              value={settings.successTitle}
              onChange={(e) =>
                onSettings({ successTitle: e.target.value }, "st")
              }
            />
          </Row>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="st-msg" className="text-xs font-medium">
                Message
              </label>
              <PipingPicker
                schema={schema}
                onInsert={(t) =>
                  onSettings({
                    successMessage: `${settings.successMessage}${settings.successMessage.endsWith(" ") || !settings.successMessage ? "" : " "}${t}`,
                  })
                }
              />
            </div>
            <Textarea
              id="st-msg"
              rows={4}
              value={settings.successMessage}
              onChange={(e) =>
                onSettings({ successMessage: e.target.value }, "sm")
              }
            />
            <p className="text-xs text-muted-foreground">
              Logic rules can override this with a custom ending.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Button label" htmlFor="st-cta">
              <Input
                id="st-cta"
                className="h-8"
                value={settings.ctaLabel ?? ""}
                placeholder="Visit website"
                onChange={(e) =>
                  onSettings({ ctaLabel: e.target.value }, "cta")
                }
              />
            </Row>
            <Row label="Button URL" htmlFor="st-ctaurl">
              <Input
                id="st-ctaurl"
                className="h-8"
                value={settings.ctaUrl ?? ""}
                placeholder="https://"
                onChange={(e) => onSettings({ ctaUrl: e.target.value }, "ctau")}
              />
            </Row>
          </div>
          <SwitchRow
            id="st-receipt"
            label="Show response receipt"
            description="Respondents can view, print or download their answers."
            checked={settings.showReceipt}
            onChange={(showReceipt) => onSettings({ showReceipt })}
          />
          <SwitchRow
            id="st-resume"
            label="Save & resume later"
            description="Respondents can save progress and get a private link to finish later."
            checked={settings.saveAndResume}
            onChange={(saveAndResume) => onSettings({ saveAndResume })}
          />
          {settings.saveAndResume && (
            <Row label="Resume link lifetime (days)" htmlFor="st-resume-ttl">
              <NumberInput
                id="st-resume-ttl"
                value={settings.resumeTtlDays}
                min={1}
                max={90}
                onChange={(v) =>
                  onSettings(
                    { resumeTtlDays: Math.min(90, Math.max(1, v ?? 14)) },
                    "ttl"
                  )
                }
              />
            </Row>
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="redirect">
        <AccordionTrigger className="text-sm hover:no-underline">
          <span className="flex items-center gap-2">
            Redirect{" "}
            {settings.redirectEnabled && (
              <Badge variant="secondary" className="text-[10px]">
                on
              </Badge>
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <SwitchRow
            id="rd-on"
            label="Redirect after submit"
            checked={settings.redirectEnabled}
            onChange={(redirectEnabled) => onSettings({ redirectEnabled })}
          />
          <Row
            label="Redirect URL"
            htmlFor="rd-url"
            description="Supports {{piping}}, e.g. https://cal.com/acme?email={{email}}"
          >
            <Input
              id="rd-url"
              className="h-8"
              disabled={!settings.redirectEnabled}
              value={settings.redirectUrl ?? ""}
              placeholder="https://"
              onChange={(e) =>
                onSettings({ redirectUrl: e.target.value }, "rdu")
              }
            />
          </Row>
          <Row label="Delay (seconds)" htmlFor="rd-delay">
            <NumberInput
              id="rd-delay"
              value={settings.redirectDelay}
              min={0}
              max={30}
              onChange={(v) =>
                onSettings(
                  { redirectDelay: Math.min(30, Math.max(0, v ?? 0)) },
                  "rdd"
                )
              }
            />
          </Row>
          <SwitchRow
            id="rd-fwd"
            label="Forward URL parameters"
            description="Pass UTM and other query params plus submission_id to the destination."
            checked={settings.forwardParams}
            onChange={(forwardParams) => onSettings({ forwardParams })}
            disabled={!settings.redirectEnabled}
          />
        </AccordionContent>
      </AccordionItem>

      {stepped && (
        <AccordionItem value="stepper">
          <AccordionTrigger className="text-sm hover:no-underline">
            Steps & progress
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <Row label="Progress indicator">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={schema.stepper.progressStyle}
                onValueChange={(v) =>
                  v &&
                  onSchema((s) => ({
                    ...s,
                    stepper: {
                      ...s.stepper,
                      progressStyle:
                        v as FormSchema["stepper"]["progressStyle"],
                    },
                  }))
                }
              >
                <ToggleGroupItem value="bar">Bar</ToggleGroupItem>
                <ToggleGroupItem value="steps">Numbers</ToggleGroupItem>
                <ToggleGroupItem value="percentage">Percent</ToggleGroupItem>
              </ToggleGroup>
            </Row>
            <SwitchRow
              id="sp-titles"
              label="Show step titles"
              checked={schema.stepper.showStepTitles}
              onChange={(showStepTitles) =>
                onSchema((s) => ({
                  ...s,
                  stepper: { ...s.stepper, showStepTitles },
                }))
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Row label="Next label" htmlFor="sp-next">
                <Input
                  id="sp-next"
                  className="h-8"
                  value={schema.stepper.nextLabel}
                  onChange={(e) =>
                    onSchema(
                      (s) => ({
                        ...s,
                        stepper: { ...s.stepper, nextLabel: e.target.value },
                      }),
                      "spn"
                    )
                  }
                />
              </Row>
              <Row label="Back label" htmlFor="sp-back">
                <Input
                  id="sp-back"
                  className="h-8"
                  value={schema.stepper.backLabel}
                  onChange={(e) =>
                    onSchema(
                      (s) => ({
                        ...s,
                        stepper: { ...s.stepper, backLabel: e.target.value },
                      }),
                      "spb"
                    )
                  }
                />
              </Row>
            </div>
            <p className="text-xs text-muted-foreground">
              Add a “Step Break” block from the library to start a new step.
            </p>
          </AccordionContent>
        </AccordionItem>
      )}

      {scoring && (
        <AccordionItem value="quiz">
          <AccordionTrigger className="text-sm hover:no-underline">
            Scoring & outcomes
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Assign points to options in the Field tab. Maximum possible score:{" "}
              <strong className="text-foreground">{maxScore(schema)}</strong>
            </p>
            <SwitchRow
              id="qz-reveal"
              label="Reveal score at the end"
              checked={schema.quiz.revealScore}
              onChange={(revealScore) =>
                onSchema((s) => ({ ...s, quiz: { ...s.quiz, revealScore } }))
              }
            />
            <SwitchRow
              id="qz-live"
              label="Show live score while answering"
              checked={schema.quiz.showLiveScore}
              onChange={(showLiveScore) =>
                onSchema((s) => ({ ...s, quiz: { ...s.quiz, showLiveScore } }))
              }
            />
            <SectionTitle>Outcomes by score</SectionTitle>
            {schema.quiz.outcomes.map((o, i) => (
              <div key={o.id} className="space-y-2 rounded-md border p-2.5">
                <div className="flex items-center gap-2">
                  <NumberInput
                    value={o.minScore}
                    className="h-7 w-16"
                    onChange={(v) => setOutcome(i, { minScore: v ?? 0 })}
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <NumberInput
                    value={o.maxScore}
                    className="h-7 w-16"
                    onChange={(v) => setOutcome(i, { maxScore: v ?? 0 })}
                  />
                  <span className="text-xs text-muted-foreground">pts</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7 hover:text-destructive"
                    aria-label="Remove outcome"
                    onClick={() =>
                      onSchema((s) => ({
                        ...s,
                        quiz: {
                          ...s.quiz,
                          outcomes: s.quiz.outcomes.filter((_, j) => j !== i),
                        },
                      }))
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <Input
                  className="h-7"
                  placeholder="Outcome title"
                  value={o.title}
                  onChange={(e) => setOutcome(i, { title: e.target.value })}
                />
                <Textarea
                  rows={2}
                  placeholder="Message (supports {{score}})"
                  value={o.message}
                  onChange={(e) => setOutcome(i, { message: e.target.value })}
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                onSchema((s) => ({
                  ...s,
                  quiz: {
                    ...s.quiz,
                    outcomes: [
                      ...s.quiz.outcomes,
                      {
                        id: uid("out"),
                        minScore: 0,
                        maxScore: maxScore(s),
                        title: "New outcome",
                        message: "You scored {{score}} / {{maxScore}}.",
                      },
                    ],
                  },
                }))
              }
            >
              <PlusIcon /> Add outcome
            </Button>
          </AccordionContent>
        </AccordionItem>
      )}

      <AccordionItem value="availability">
        <AccordionTrigger className="text-sm hover:no-underline">
          Schedule & limits
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <div className="grid grid-cols-1 gap-2">
            <Row label="Opens at" htmlFor="av-open">
              <Input
                id="av-open"
                type="datetime-local"
                className="h-8"
                value={toLocalInput(settings.opensAt)}
                onChange={(e) =>
                  onSettings({
                    opensAt: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
              />
            </Row>
            <Row label="Closes at" htmlFor="av-close">
              <Input
                id="av-close"
                type="datetime-local"
                className="h-8"
                value={toLocalInput(settings.closesAt)}
                onChange={(e) =>
                  onSettings({
                    closesAt: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
              />
            </Row>
          </div>
          <Row
            label="Response cap"
            htmlFor="av-cap"
            description="Close automatically after this many responses."
          >
            <NumberInput
              id="av-cap"
              value={settings.maxSubmissions ?? undefined}
              min={1}
              placeholder="Unlimited"
              onChange={(v) =>
                onSettings({ maxSubmissions: v ? Math.round(v) : null }, "cap")
              }
            />
          </Row>
          <Row label="Closed message" htmlFor="av-msg">
            <Textarea
              id="av-msg"
              rows={2}
              value={settings.closedMessage}
              onChange={(e) =>
                onSettings({ closedMessage: e.target.value }, "cm")
              }
            />
          </Row>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="access">
        <AccordionTrigger className="text-sm hover:no-underline">
          <span className="flex items-center gap-2">
            Access & spam{" "}
            {settings.passwordEnabled && (
              <KeyRoundIcon className="size-3.5 text-muted-foreground" />
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Password protection</span>
              <Badge
                variant={settings.passwordEnabled ? "default" : "outline"}
                className="text-[10px]"
              >
                {settings.passwordEnabled ? "Enabled" : "Off"}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                className="h-8"
                placeholder={
                  settings.passwordEnabled
                    ? "Set a new password"
                    : "Choose a password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <Button
                size="sm"
                disabled={pending || password.length < 4}
                onClick={() => savePassword(password)}
              >
                Save
              </Button>
            </div>
            {settings.passwordEnabled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive"
                disabled={pending}
                onClick={() => savePassword(null)}
              >
                Remove password
              </Button>
            )}
          </div>
          <SwitchRow
            id="ac-hp"
            label="Honeypot spam trap"
            description="Invisible field that silently drops bot submissions."
            checked={settings.honeypot}
            onChange={(honeypot) => onSettings({ honeypot })}
          />
          <Row
            label="Minimum time to submit (seconds)"
            htmlFor="ac-min"
            description="Rejects submissions completed faster than a human could."
          >
            <NumberInput
              id="ac-min"
              value={settings.minSubmitSeconds}
              min={0}
              max={60}
              onChange={(v) =>
                onSettings(
                  { minSubmitSeconds: Math.min(60, Math.max(0, v ?? 0)) },
                  "min"
                )
              }
            />
          </Row>
          <Row
            label="Allowed embed domains"
            htmlFor="ac-domains"
            description="Comma separated. Embedded submissions from other sites are rejected. Leave empty to allow all."
          >
            <Input
              id="ac-domains"
              className="h-8"
              placeholder="acme.com, app.acme.com"
              defaultValue={settings.allowedDomains.join(", ")}
              onBlur={(e) =>
                onSettings({
                  allowedDomains: e.target.value
                    .split(/[,\s]+/)
                    .map((d) =>
                      d
                        .trim()
                        .toLowerCase()
                        .replace(/^https?:\/\//, "")
                        .replace(/\/.*$/, "")
                    )
                    .filter(Boolean),
                })
              }
            />
          </Row>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="autoreply">
        <AccordionTrigger className="text-sm hover:no-underline">
          <span className="flex items-center gap-2">
            Thank-you email
            {autoReply.enabled && settings.respondentEmailFieldId && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                On
              </Badge>
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <SwitchRow
            id="ar-on"
            label="Email respondents after they submit"
            description="A branded confirmation sent to the address they typed in."
            checked={autoReply.enabled}
            onChange={(enabled) => setAutoReply({ enabled })}
          />
          <Row
            label="Send to the answer of"
            description={
              emailFields.length === 0
                ? "Add an Email field to the form to choose a recipient."
                : undefined
            }
          >
            <Select
              value={settings.respondentEmailFieldId ?? "__none"}
              disabled={emailFields.length === 0}
              onValueChange={(v) =>
                onSettings({
                  respondentEmailFieldId: v === "__none" ? null : v,
                })
              }
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Choose an email field</SelectItem>
                {emailFields.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <EmailDesignPicker
            id="ar-design"
            label="Design"
            value={autoReply.templateId}
            templates={emailTemplates}
            onChange={(templateId) => setAutoReply({ templateId })}
          />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="ar-subject" className="text-xs font-medium">
                Subject
              </label>
              <PipingPicker
                schema={schema}
                extraTokens={MAIL_TOKENS}
                onInsert={(t) =>
                  setAutoReply({ subject: appendToken(autoReply.subject, t) })
                }
              />
            </div>
            <Input
              id="ar-subject"
              className="h-8"
              value={autoReply.subject}
              maxLength={200}
              placeholder={replyTemplate ? "Template’s subject" : undefined}
              onChange={(e) =>
                setAutoReply({ subject: e.target.value }, "ar-subject")
              }
            />
            {replyTemplate && (
              <p className="text-xs text-muted-foreground">
                Leave blank to use the template&rsquo;s default subject.
              </p>
            )}
          </div>
          {!replyTemplate && (
            <>
              <Row label="Heading" htmlFor="ar-heading">
                <Input
                  id="ar-heading"
                  className="h-8"
                  value={autoReply.heading}
                  maxLength={200}
                  onChange={(e) =>
                    setAutoReply({ heading: e.target.value }, "ar-heading")
                  }
                />
              </Row>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="ar-body" className="text-xs font-medium">
                    Message
                  </label>
                  <PipingPicker
                    schema={schema}
                    extraTokens={MAIL_TOKENS}
                    onInsert={(t) =>
                      setAutoReply({ body: appendToken(autoReply.body, t) })
                    }
                  />
                </div>
                <Textarea
                  id="ar-body"
                  rows={7}
                  value={autoReply.body}
                  maxLength={5000}
                  onChange={(e) =>
                    setAutoReply({ body: e.target.value }, "ar-body")
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Blank lines start a new paragraph. Tokens like{" "}
                  {"{{form_title}}"} are replaced per response.
                </p>
              </div>
              <SwitchRow
                id="ar-answers"
                label="Include a copy of their answers"
                checked={autoReply.includeAnswers}
                onChange={(includeAnswers) => setAutoReply({ includeAnswers })}
              />
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Row label="Sender name" htmlFor="ar-from">
              <Input
                id="ar-from"
                className="h-8"
                value={autoReply.fromName}
                placeholder="Form title"
                maxLength={80}
                onChange={(e) =>
                  setAutoReply({ fromName: e.target.value }, "ar-from")
                }
              />
            </Row>
            <Row label="Reply-to" htmlFor="ar-reply">
              <Input
                id="ar-reply"
                type="email"
                className="h-8"
                value={autoReply.replyTo}
                placeholder={settings.notifyEmails[0] || "you@company.com"}
                onChange={(e) =>
                  setAutoReply({ replyTo: e.target.value.trim() }, "ar-reply")
                }
              />
            </Row>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={testing}
            onClick={sendTest}
          >
            {testing ? <Loader2Icon className="animate-spin" /> : <SendIcon />}{" "}
            Send me a test email
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Delivered with Brevo (<code>BREVO_API_KEY</code>), Mailtrap (
            <code>MAILTRAP_API_KEY</code>) or any SMTP server. Without one,
            emails are kept in the outbox for review.
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="notify">
        <AccordionTrigger className="text-sm hover:no-underline">
          Notifications & webhooks
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <Row
            label="Email me new responses"
            htmlFor="nt-emails"
            description="Comma separated addresses. Delivered through Brevo, Mailtrap or SMTP when configured on the server."
          >
            <Input
              id="nt-emails"
              className="h-8"
              placeholder="you@company.com"
              defaultValue={settings.notifyEmails.join(", ")}
              onBlur={(e) =>
                onSettings({
                  notifyEmails: e.target.value
                    .split(/[,\s]+/)
                    .map((x) => x.trim())
                    .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)),
                })
              }
            />
          </Row>
          <EmailDesignPicker
            id="nt-design"
            label="Notification design"
            value={settings.notifyTemplateId}
            templates={emailTemplates}
            onChange={(notifyTemplateId) => onSettings({ notifyTemplateId })}
          />
          {features.webhooks ? (
            <>
              <SwitchRow
                id="nt-wh"
                label="Send webhooks on submit"
                checked={settings.webhooksEnabled}
                onChange={(webhooksEnabled) => onSettings({ webhooksEnabled })}
              />
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link href={`/dashboard/forms/${formId}/integrations`}>
                  Manage webhooks
                </Link>
              </Button>
            </>
          ) : (
            <LockedNotice title="Webhooks need Pro">
              Send signed JSON payloads to Zapier, Make or your API.
            </LockedNotice>
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="branding" className="border-b-0">
        <AccordionTrigger className="text-sm hover:no-underline">
          Branding badge
        </AccordionTrigger>
        <AccordionContent className="space-y-3">
          {features.removeBadge ? (
            <SwitchRow
              id="br-badge"
              label="Hide “Made with Digital Fueled”"
              checked={settings.hideBadge}
              onChange={(hideBadge) => onSettings({ hideBadge })}
            />
          ) : (
            <LockedNotice title="Remove the badge on Pro">
              The Digital Fueled badge is shown on Free forms.
            </LockedNotice>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
