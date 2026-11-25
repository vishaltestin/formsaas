"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CornerDownLeftIcon, TrophyIcon } from "lucide-react"
import { Controller, useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form"

import { FieldControl } from "@/components/renderer/field-control"
import { FieldShell, LayoutBlock, widthClass } from "@/components/renderer/field-block"
import { ResumeBar } from "@/components/renderer/resume-bar"
import { SuccessScreen } from "@/components/renderer/success-screen"
import { ThemeScope } from "@/components/renderer/theme-scope"
import {
  buildZodSchema,
  computeScore,
  evaluateLogic,
  isInputField,
  maxScore,
  nextStepIndex,
  prevStepIndex,
  resolveCompletion,
  uid,
  type CompletionResult,
  type FieldValue,
  type FormField,
  type FormMode,
  type FormSchema,
  type FormValues,
  type LogicResult,
  type PublicFormSettings,
  type ThemeConfig,
} from "@/lib/form-engine"
import { cn } from "@/lib/utils"

export type EmbedSource = "DIRECT" | "IFRAME" | "SCRIPT" | "POPUP" | "DRAWER"

export interface FormRendererProps {
  formId: string
  slug: string
  title: string
  description?: string | null
  mode: FormMode
  schema: FormSchema
  theme: ThemeConfig
  settings: PublicFormSettings
  preview?: boolean
  source?: EmbedSource
  logicEnabled?: boolean
  showBadge?: boolean
  allowCustomCss?: boolean
  allowBranding?: boolean
  maxUploadMb?: number
  unlockToken?: string
  embedded?: boolean
  className?: string
  /** Observe live values + logic (used by the landing sandbox). */
  onValuesChange?: (values: FormValues, logic: LogicResult) => void
}

function emptyValue(field: FormField): FieldValue {
  if (field.defaultValue !== undefined && field.defaultValue !== null) return field.defaultValue
  switch (field.type) {
    case "checkboxes":
    case "multi_select":
    case "ranking":
      return []
    case "matrix":
    case "full_name":
    case "date_range":
    case "appointment":
      return {}
    case "address":
      return field.props?.defaultCountry ? { country: field.props.defaultCountry } : {}
    case "consent":
      return false
    case "yes_no":
    case "file":
    case "signature":
      return null
    default:
      return ""
  }
}

interface Card {
  key: string
  field: FormField | null
  preface: FormField[]
  stepIndex: number
}

function buildCards(logic: LogicResult): Card[] {
  const cards: Card[] = []
  for (const stepIdx of logic.path) {
    const step = logic.steps[stepIdx]
    let preface: FormField[] = []
    for (const f of step.fields) {
      if (logic.hidden.has(f.id)) continue
      if (f.type === "hidden") continue
      if (!isInputField(f)) {
        preface.push(f)
        continue
      }
      cards.push({ key: f.id, field: f, preface, stepIndex: stepIdx })
      preface = []
    }
    if (preface.length) cards.push({ key: `p-${preface[0].id}`, field: null, preface, stepIndex: stepIdx })
  }
  return cards
}

const CHOICE_TYPES = new Set(["radio", "select", "image_choice", "checkboxes", "multi_select", "yes_no"])

export function FormRenderer(props: FormRendererProps) {
  const {
    formId,
    slug,
    title,
    description,
    mode,
    schema,
    theme,
    settings,
    preview = false,
    source = "DIRECT",
    logicEnabled = true,
    showBadge = false,
    allowCustomCss = false,
    allowBranding = true,
    maxUploadMb,
    unlockToken,
    embedded = false,
    className,
    onValuesChange,
  } = props

  const inputFields = useMemo(() => schema.fields.filter(isInputField), [schema])
  const defaultValues = useMemo(() => {
    const dv: FormValues = {}
    for (const f of inputFields) dv[f.id] = emptyValue(f)
    return dv
  }, [inputFields])

  const resolver = useCallback<Resolver<FormValues>>(
    async (values, ctx, options) => {
      const logic = evaluateLogic(schema, values, { mode, enabled: logicEnabled })
      const zs = buildZodSchema(schema, logic.visibleFieldIds, { requiredIds: logic.required, maxUploadMb })
      return (zodResolver(zs as unknown as Parameters<typeof zodResolver>[0]) as unknown as Resolver<FormValues>)(values, ctx, options)
    },
    [schema, mode, logicEnabled, maxUploadMb]
  )

  const form = useForm<FormValues>({
    defaultValues,
    resolver,
    mode: "onTouched",
    reValidateMode: "onChange",
  })
  const watched = useWatch({ control: form.control }) as FormValues
  const values = useMemo(() => ({ ...defaultValues, ...watched }), [defaultValues, watched])
  const logic = useMemo(
    () => evaluateLogic(schema, values, { mode, enabled: logicEnabled }),
    [schema, values, mode, logicEnabled]
  )

  // Apply SET_VALUE / CALCULATE results.
  useEffect(() => {
    for (const [id, v] of Object.entries(logic.setValues)) {
      if (JSON.stringify(form.getValues(id)) !== JSON.stringify(v)) form.setValue(id, v as FieldValue)
    }
  }, [logic.setValues, form])

  /* ───────── telemetry ───────── */
  const sessionId = useRef<string>("")
  const startedAt = useRef<number | null>(null)
  const metaRef = useRef<{ utm: Record<string, string>; referrer: string; url: string }>({ utm: {}, referrer: "", url: "" })

  const track = useCallback(
    (type: "VIEW" | "START" | "STEP_COMPLETE", stepIndex?: number) => {
      if (preview || !sessionId.current) return
      void fetch(`/api/public/forms/${encodeURIComponent(slug)}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, stepIndex, sessionId: sessionId.current, source }),
        keepalive: true,
      }).catch(() => undefined)
    },
    [preview, slug, source]
  )

  useEffect(() => {
    // Hidden fields read URL query params.
    const params = new URLSearchParams(window.location.search)
    for (const f of inputFields) {
      if (f.type !== "hidden") continue
      const p = params.get(f.props?.paramName || f.key)
      if (p !== null) form.setValue(f.id, p)
    }
    const utm: Record<string, string> = {}
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref"]) {
      const v = params.get(k)
      if (v) utm[k] = v
    }
    metaRef.current = { utm, referrer: params.get("parent_referrer") || document.referrer, url: window.location.href }
    if (preview) return
    const storageKey = `fs_session_${formId}`
    let sid = ""
    try {
      sid = sessionStorage.getItem(storageKey) ?? ""
      if (!sid) {
        sid = uid("s")
        sessionStorage.setItem(storageKey, sid)
      }
    } catch {
      sid = uid("s")
    }
    sessionId.current = sid
    track("VIEW")
  }, [formId, inputFields, form, preview, track])

  useEffect(() => {
    const sub = form.watch((_v, info) => {
      if (startedAt.current === null && info.type === "change") {
        startedAt.current = Date.now()
        track("START", 0)
      }
    })
    return () => sub.unsubscribe()
  }, [form, track])

  /* ───────── navigation state ───────── */
  const stepped = (mode === "STEPPER" || mode === "QUIZ") && logic.steps.length > 1
  const [stepIdx, setStepIdx] = useState(0)
  const cards = useMemo(() => (mode === "CARD" ? buildCards(logic) : []), [mode, logic])
  const [cardIdx, setCardIdx] = useState(0)

  useEffect(() => {
    onValuesChange?.(values, logic)
  }, [values, logic, onValuesChange])

  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle")
  const [completion, setCompletion] = useState<CompletionResult | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [resumeToken, setResumeToken] = useState<string | null>(null)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [resumeNotice, setResumeNotice] = useState<string | null>(null)
  const [answers, setAnswers] = useState<FormValues>({})
  const [honeypot, setHoneypot] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  // Save & resume: restore a draft from ?resume=<token>.
  useEffect(() => {
    if (preview || !settings.saveAndResume || typeof window === "undefined") return
    const token = new URLSearchParams(window.location.search).get("resume")
    if (!token) return
    let cancelled = false
    void fetch(`/api/public/forms/${encodeURIComponent(slug)}/resume?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; values?: FormValues; stepIndex?: number; error?: string }) => {
        if (cancelled) return
        if (!data.ok) {
          setResumeNotice(data.error ?? "This resume link is no longer valid.")
          return
        }
        form.reset({ ...defaultValues, ...(data.values ?? {}) })
        setResumeToken(token)
        setStepIdx(Math.max(0, data.stepIndex ?? 0))
        setResumeNotice("Welcome back — your saved answers were restored.")
      })
      .catch(() => !cancelled && setResumeNotice("We couldn't load your saved progress."))
    return () => {
      cancelled = true
    }
  }, [preview, settings.saveAndResume, slug, form, defaultValues])

  const scrollTop = () => {
    if (embedded) return
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const goToField = useCallback(
    (fieldId: string) => {
      if (mode === "CARD") {
        const idx = cards.findIndex((c) => c.field?.id === fieldId)
        if (idx >= 0) setCardIdx(idx)
      } else if (stepped) {
        const idx = logic.steps.findIndex((s) => s.fields.some((f) => f.id === fieldId))
        if (idx >= 0) setStepIdx(idx)
      }
      requestAnimationFrame(() => form.setFocus(fieldId))
    },
    [mode, cards, stepped, logic.steps, form]
  )

  const onInvalid = useCallback(
    (errors: FieldErrors<FormValues>) => {
      const first = inputFields.find((f) => errors[f.id])
      if (first) goToField(first.id)
    },
    [inputFields, goToField]
  )

  const submit = form.handleSubmit(async (vals) => {
    const lr = evaluateLogic(schema, vals, { mode, enabled: logicEnabled })
    const merged = { ...vals, ...lr.setValues }
    const clean: FormValues = {}
    for (const id of lr.visibleFieldIds) clean[id] = merged[id]
    setSubmitError(null)

    if (preview) {
      setAnswers(clean)
      setCompletion(resolveCompletion(schema, settings, clean, lr, mode))
      setStatus("done")
      return
    }

    setStatus("submitting")
    try {
      const res = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: clean,
          sessionId: sessionId.current,
          source,
          startedAt: startedAt.current,
          meta: metaRef.current,
          hp: honeypot,
          token: unlockToken,
          resumeToken: resumeToken ?? undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        errors?: Record<string, string>
        submissionId?: string
        completion?: CompletionResult
        receiptUrl?: string | null
      }
      if (!res.ok || !data.ok) {
        if (data.errors) {
          for (const [id, message] of Object.entries(data.errors)) form.setError(id, { message })
          const first = Object.keys(data.errors)[0]
          if (first) goToField(first)
        }
        setSubmitError(data.error ?? "We couldn't submit your response. Please try again.")
        setStatus("idle")
        return
      }
      setAnswers(clean)
      setSubmissionId(data.submissionId ?? null)
      setReceiptUrl(data.receiptUrl ?? null)
      setCompletion(data.completion ?? resolveCompletion(schema, settings, clean, lr, mode))
      setStatus("done")
      scrollTop()
    } catch {
      setSubmitError("Network error — please check your connection and try again.")
      setStatus("idle")
    }
  }, onInvalid)

  const currentStep = logic.steps[stepIdx] ?? logic.steps[0]
  const isLastStep = stepped ? nextStepIndex(logic, stepIdx) === "end" : true

  const nextStep = async () => {
    const ids = currentStep.fields.filter((f) => logic.visibleFieldIds.has(f.id)).map((f) => f.id)
    const valid = await form.trigger(ids, { shouldFocus: true })
    if (!valid) return
    track("STEP_COMPLETE", stepIdx)
    const n = nextStepIndex(logic, stepIdx)
    if (n === "end") return void submit()
    setStepIdx(n)
    scrollTop()
  }
  const prevStep = () => {
    const p = prevStepIndex(logic, stepIdx)
    if (p !== null) setStepIdx(p)
  }

  const currentCard = cards[Math.min(cardIdx, Math.max(0, cards.length - 1))]
  const nextCard = useCallback(async () => {
    if (!currentCard) return
    if (currentCard.field) {
      const valid = await form.trigger(currentCard.field.id, { shouldFocus: true })
      if (!valid) return
    }
    const nextIdx = cardIdx + 1
    if (cards[nextIdx]?.stepIndex !== currentCard.stepIndex) track("STEP_COMPLETE", currentCard.stepIndex)
    if (nextIdx >= cards.length) return void submit()
    setCardIdx(nextIdx)
  }, [currentCard, cardIdx, cards, form, submit, track])

  // Card mode keyboard navigation: Enter advances, A/B/C picks options.
  useEffect(() => {
    if (mode !== "CARD" || status !== "idle") return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable
      if (e.key === "Enter" && !e.shiftKey) {
        if (tag === "TEXTAREA" && !(e.metaKey || e.ctrlKey)) return
        if (tag === "BUTTON" && target?.getAttribute("type") === "submit") return
        e.preventDefault()
        void nextCard()
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      const field = currentCard?.field
      if (!field || !CHOICE_TYPES.has(field.type)) return
      if (!/^[a-z]$/i.test(e.key)) return
      const idx = e.key.toUpperCase().charCodeAt(0) - 65
      if (field.type === "yes_no") {
        if (idx === 0) form.setValue(field.id, true, { shouldValidate: true, shouldDirty: true, shouldTouch: true })
        if (idx === 1) form.setValue(field.id, false, { shouldValidate: true, shouldDirty: true, shouldTouch: true })
        return
      }
      const opt = field.options?.[idx]
      if (!opt) return
      e.preventDefault()
      if (field.type === "checkboxes" || field.type === "multi_select") {
        const cur = (form.getValues(field.id) as string[]) ?? []
        form.setValue(field.id, cur.includes(opt.value) ? cur.filter((x) => x !== opt.value) : [...cur, opt.value], {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        })
      } else {
        form.setValue(field.id, opt.value, { shouldValidate: true, shouldDirty: true, shouldTouch: true })
      }
      if (startedAt.current === null) {
        startedAt.current = Date.now()
        track("START", 0)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mode, status, currentCard, nextCard, form, track])

  /* ───────── field rendering ───────── */
  const renderField = (field: FormField, opts: { large?: boolean; showKeys?: boolean; autoFocus?: boolean } = {}) => {
    if (logic.hidden.has(field.id)) return null
    if (!isInputField(field)) return <LayoutBlock field={field} asSection={!stepped && mode !== "CARD"} />
    if (field.type === "hidden") return null
    const required = !!field.required || logic.required.has(field.id)
    const inputId = `fs-${field.id}`
    return (
      <Controller
        control={form.control}
        name={field.id}
        render={({ field: rhf, fieldState }) => (
          <FieldShell field={field} required={required} error={fieldState.error?.message} htmlFor={inputId} large={opts.large}>
            <FieldControl
              field={field}
              value={rhf.value as FieldValue}
              onChange={(v) => rhf.onChange(v)}
              onBlur={rhf.onBlur}
              invalid={!!fieldState.error}
              showKeys={opts.showKeys}
              autoFocus={opts.autoFocus}
              inputId={inputId}
              maxUploadMb={maxUploadMb}
              slotsEndpoint={preview ? undefined : `/api/public/forms/${encodeURIComponent(slug)}/slots`}
            />
          </FieldShell>
        )}
      />
    )
  }

  const renderGrid = (fields: FormField[]) => (
    <div className="grid grid-cols-12 gap-x-4" style={{ rowGap: "var(--fs-gap)" }}>
      {fields.map((f) => {
        if (logic.hidden.has(f.id) || f.type === "hidden") return null
        if (f.type === "step_break" && (stepped || mode === "CARD")) return null
        return (
          <div key={f.id} className={isInputField(f) ? widthClass(f.width) : "col-span-12"}>
            {renderField(f)}
          </div>
        )
      })}
    </div>
  )

  const liveScore = mode === "QUIZ" && schema.quiz.showLiveScore
  const score = liveScore ? computeScore(schema, values, logic.visibleFieldIds) : 0
  const maxPossible = liveScore ? maxScore(schema) : 0

  const pathPos = Math.max(0, logic.path.indexOf(stepIdx))
  const progressPct =
    mode === "CARD"
      ? cards.length
        ? Math.round((cardIdx / cards.length) * 100)
        : 0
      : logic.path.length
        ? Math.round((pathPos / logic.path.length) * 100)
        : 0

  const buttonLabel = theme.buttonText || "Submit"
  const submitting = status === "submitting"

  const header = (
    <div className="mb-6">
      {allowBranding && theme.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.logoUrl} alt="" className="mb-5 h-9 w-auto object-contain" />
      )}
      <div className="flex items-start justify-between gap-4">
        <h1 className="fs-heading">{title}</h1>
        {liveScore && status !== "done" && (
          <span className="fs-badge shrink-0 font-medium" aria-live="polite">
            <TrophyIcon className="size-3.5" /> {score} / {maxPossible}
          </span>
        )}
      </div>
      {description && <p className="fs-muted mt-2">{description}</p>}
    </div>
  )

  const errorBanner = submitError && (
    <div
      role="alert"
      className="mb-4 px-3 py-2 text-sm"
      style={{
        borderRadius: "var(--fs-radius)",
        border: "1px solid color-mix(in srgb, var(--fs-error) 40%, transparent)",
        background: "color-mix(in srgb, var(--fs-error) 8%, var(--fs-surface))",
        color: "var(--fs-error)",
      }}
    >
      {submitError}
    </div>
  )

  const honeypotField = settings.honeypot && !preview && (
    <div className="fs-hp" aria-hidden="true">
      <label>
        Leave this field empty
        <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} name="company_website" />
      </label>
    </div>
  )

  let body: React.ReactNode
  if (status === "done" && completion) {
    body = (
      <SuccessScreen
        completion={completion}
        schema={schema}
        answers={answers}
        formTitle={title}
        submissionId={submissionId}
        receiptUrl={receiptUrl}
        preview={preview}
        embedded={embedded}
      />
    )
  } else if (mode === "CARD") {
    const card = currentCard
    body = (
      <div className="flex min-h-[340px] flex-col" onSubmit={(e) => e.preventDefault()}>
        <div className="fs-progress mb-8" aria-hidden="true">
          <div style={{ width: `${progressPct}%` }} />
        </div>
        {card ? (
          <div key={card.key} className="flex flex-1 flex-col gap-5 duration-300 animate-in fade-in slide-in-from-bottom-3">
            <div className="fs-muted flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
              <span>
                {cardIdx + 1} / {cards.length}
              </span>
            </div>
            {card.preface.map((p) => (
              <div key={p.id}>{renderField(p)}</div>
            ))}
            {card.field && renderField(card.field, { large: true, showKeys: CHOICE_TYPES.has(card.field.type), autoFocus: true })}
            <div className="mt-auto flex items-center gap-3 pt-4">
              <button type="button" className="fs-button" onClick={() => void nextCard()} disabled={submitting}>
                {cardIdx + 1 >= cards.length ? (submitting ? "Submitting…" : buttonLabel) : "OK"}
                {cardIdx + 1 >= cards.length ? <CheckIcon className="size-4" /> : <ArrowRightIcon className="size-4" />}
              </button>
              <span className="fs-muted hidden items-center gap-1 text-xs @md:flex">
                press <strong>Enter</strong> <CornerDownLeftIcon className="size-3" />
              </span>
              {cardIdx > 0 && (
                <button type="button" className="fs-button fs-button-ghost ml-auto" onClick={() => setCardIdx((i) => Math.max(0, i - 1))}>
                  <ArrowLeftIcon className="size-4" /> Back
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="fs-muted">This form has no questions yet.</p>
        )}
      </div>
    )
  } else if (stepped) {
    const style = schema.stepper.progressStyle
    const pathSteps = logic.path.map((i) => logic.steps[i])
    body = (
      <div>
        <div className="mb-6">
          {style === "steps" ? (
            <ol className="flex items-center gap-2 overflow-x-auto pb-1">
              {pathSteps.map((s, i) => {
                const state = i < pathPos ? "done" : i === pathPos ? "active" : "todo"
                return (
                  <li key={s.id} className="flex shrink-0 items-center gap-2">
                    <span className="fs-step-dot" data-state={state}>
                      {state === "done" ? <CheckIcon className="size-3.5" /> : i + 1}
                    </span>
                    {schema.stepper.showStepTitles && (
                      <span className={cn("text-sm", state === "active" ? "font-medium" : "fs-muted hidden @md:inline")}>{s.title}</span>
                    )}
                    {i < pathSteps.length - 1 && <span className="mx-1 h-px w-6" style={{ background: "var(--fs-border)" }} />}
                  </li>
                )
              })}
            </ol>
          ) : (
            <>
              <div className="fs-muted mb-2 flex justify-between text-xs">
                <span>
                  {schema.stepper.showStepTitles ? `${currentStep.title} · ` : ""}Step {pathPos + 1} of {logic.path.length}
                </span>
                {style === "percentage" && <span className="font-mono">{progressPct}%</span>}
              </div>
              <div className="fs-progress">
                <div style={{ width: `${style === "percentage" ? progressPct : ((pathPos + 1) / logic.path.length) * 100}%` }} />
              </div>
            </>
          )}
        </div>
        <div key={currentStep.id} className="duration-200 animate-in fade-in">
          {currentStep.description && <p className="fs-muted -mt-2 mb-5 text-sm">{currentStep.description}</p>}
          {renderGrid(currentStep.fields)}
        </div>
        <div className="mt-8 flex items-center justify-between gap-3">
          {prevStepIndex(logic, stepIdx) !== null ? (
            <button type="button" className="fs-button fs-button-ghost" onClick={prevStep}>
              <ArrowLeftIcon className="size-4" /> {schema.stepper.backLabel || "Back"}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="fs-button" onClick={() => void nextStep()} disabled={submitting}>
            {isLastStep ? (submitting ? "Submitting…" : buttonLabel) : schema.stepper.nextLabel || "Next"}
            {!isLastStep && <ArrowRightIcon className="size-4" />}
          </button>
        </div>
      </div>
    )
  } else {
    body = (
      <div>
        {renderGrid(schema.fields)}
        <div className="mt-8">
          <button type="submit" className="fs-button" disabled={submitting}>
            {submitting ? "Submitting…" : buttonLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <ThemeScope theme={theme} scopeId={formId} allowCustomCss={allowCustomCss} className={cn("@container", className)}>
      <div ref={containerRef} className={cn("px-4", embedded ? "py-4" : "min-h-svh py-8 @2xl:py-14")}>
        <div className="mx-auto w-full" style={{ maxWidth: "var(--fs-max-width)" }}>
          {allowBranding && theme.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={theme.coverUrl}
              alt=""
              className="mb-[-1px] h-40 w-full object-cover @2xl:h-48"
              style={{ borderTopLeftRadius: "calc(var(--fs-radius) + 4px)", borderTopRightRadius: "calc(var(--fs-radius) + 4px)" }}
            />
          )}
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (mode === "CLASSIC" || (!stepped && mode !== "CARD")) void submit()
            }}
            className="fs-card relative p-6 @xl:p-9"
            style={allowBranding && theme.coverUrl ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : undefined}
          >
            {status !== "done" && header}
            {resumeNotice && status !== "done" && (
              <p role="status" className="fs-badge mb-4">
                {resumeNotice}
              </p>
            )}
            {errorBanner}
            {honeypotField}
            {body}
          </form>
          {settings.saveAndResume && status !== "done" && (
            <ResumeBar
              slug={slug}
              preview={preview}
              getValues={() => form.getValues()}
              stepIndex={mode === "CARD" ? 0 : stepIdx}
              token={resumeToken}
              onToken={setResumeToken}
            />
          )}
          {showBadge && (
            <div className="mt-5 flex justify-center fs-no-print">
              <a href="/" target="_blank" rel="noreferrer" className="fs-badge hover:opacity-80">
                Made with <strong style={{ color: "var(--fs-text)" }}>Digital Fueled</strong>
              </a>
            </div>
          )}
        </div>
      </div>
    </ThemeScope>
  )
}
