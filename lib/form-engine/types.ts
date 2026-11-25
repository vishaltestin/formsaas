/**
 * Digital Fueled — Unified form schema contract.
 *
 * A single strongly typed document drives the Builder, the Public Renderer,
 * the Conditional Logic engine and server-side validation. Field values are
 * addressed by `field.id` internally (stable across label/key edits) and
 * persisted / exported / piped by `field.key`.
 */

export const FORM_MODES = ["CLASSIC", "STEPPER", "CARD", "QUIZ"] as const
export type FormMode = (typeof FORM_MODES)[number]

export const FIELD_TYPES = [
  // Inputs
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "url",
  "password",
  "full_name",
  "address",
  "currency",
  "color",
  // Selection
  "select",
  "multi_select",
  "radio",
  "checkboxes",
  "yes_no",
  "image_choice",
  "country",
  "ranking",
  // Rating & scales
  "rating",
  "scale",
  "slider",
  "matrix",
  // Date & rich
  "date",
  "time",
  "datetime",
  "date_range",
  "appointment",
  "file",
  "signature",
  "consent",
  "hidden",
  "calculated",
  // Layout blocks
  "heading",
  "paragraph",
  "divider",
  "image",
  "video",
  "step_break",
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export type FieldWidth = "full" | "half" | "third"

export interface FieldOption {
  id: string
  label: string
  value: string
  /** Quiz points awarded when selected. */
  points?: number
  /** For image choice. */
  imageUrl?: string
}

export interface MatrixItem {
  id: string
  label: string
}

export type CrossFieldOperator = "equals" | "not_equals" | "gt" | "gte" | "lt" | "lte"

export interface CrossFieldRule {
  operator: CrossFieldOperator
  /** id of the field to compare against */
  fieldId: string
  message?: string
}

export const TEXT_FORMATS = [
  "none",
  "email",
  "url",
  "phone",
  "alphanumeric",
  "pan",
  "gstin",
  "aadhaar",
  "ifsc",
  "pincode_in",
  "zip_us",
  "postcode_uk",
  "iban",
] as const
export type TextFormat = (typeof TEXT_FORMATS)[number]

export interface FieldValidation {
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
  format?: TextFormat
  /** email: reject free/consumer mailbox providers */
  businessEmail?: boolean
  /** date: respondent age bounds (date of birth) */
  minAge?: number
  maxAge?: number
  dateMin?: string
  dateMax?: string
  dateRule?: "any" | "past" | "future"
  maxFileMb?: number
  accept?: string[]
  minSelected?: number
  maxSelected?: number
  crossField?: CrossFieldRule
  messages?: {
    required?: string
    minLength?: string
    maxLength?: string
    min?: string
    max?: string
    pattern?: string
    format?: string
    date?: string
    file?: string
    selection?: string
  }
}

export interface FieldProps {
  /** long_text rows */
  rows?: number
  /** rating: number of stars */
  maxRating?: number
  /** scale */
  scaleMin?: number
  scaleMax?: number
  minLabel?: string
  maxLabel?: string
  /** marks a 0–10 scale as NPS for analytics */
  nps?: boolean
  /** matrix */
  matrixRows?: MatrixItem[]
  matrixColumns?: MatrixItem[]
  /** heading / paragraph / step_break description */
  content?: string
  level?: 1 | 2 | 3
  /** image banner */
  imageUrl?: string
  alt?: string
  /** consent */
  consentText?: string
  linkUrl?: string
  linkLabel?: string
  /** hidden: query param to read (falls back to field key) */
  paramName?: string
  /** yes/no labels */
  yesLabel?: string
  noLabel?: string
  /** number step */
  step?: number
  /** calculated: formula using {{field_key}} tokens and FORMULA_FUNCTIONS */
  formula?: string
  /** calculated: decimals to display/store */
  decimals?: number
  /** prefix/suffix e.g. currency */
  prefix?: string
  suffix?: string
  /** phone: show a country-code picker; country/phone/address default region (ISO alpha-2) */
  countryCode?: boolean
  defaultCountry?: string
  /** full_name parts */
  showTitle?: boolean
  showMiddle?: boolean
  /** address parts */
  showLine2?: boolean
  showState?: boolean
  /** currency ISO 4217 code */
  currency?: string
  /** appointment: daily window, slot length, booking horizon and allowed weekdays (0 = Sunday) */
  slotStart?: string
  slotEnd?: string
  slotMinutes?: number
  daysAhead?: number
  weekdays?: number[]
  /** appointment: each slot can be booked by one submission only */
  exclusiveSlots?: boolean
  /** video block: YouTube, Vimeo or Loom URL */
  videoUrl?: string
}

export interface FormField {
  id: string
  key: string
  type: FieldType
  label: string
  placeholder?: string
  helpText?: string
  defaultValue?: FieldValue
  required?: boolean
  width?: FieldWidth
  options?: FieldOption[]
  validation?: FieldValidation
  props?: FieldProps
}

export interface FileValue {
  name: string
  size: number
  type: string
  dataUrl: string
}

export type FieldValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string>
  | FileValue
  | null
  | undefined

export type FormValues = Record<string, FieldValue>

/* ───────────── Conditional logic ───────────── */

export const LOGIC_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "less_than",
  "is_empty",
  "is_not_empty",
] as const
export type LogicOperator = (typeof LOGIC_OPERATORS)[number]

export interface LogicCondition {
  id: string
  fieldId: string
  operator: LogicOperator
  value?: string
}

export const LOGIC_ACTIONS = [
  "SHOW_FIELD",
  "HIDE_FIELD",
  "REQUIRE_FIELD",
  "JUMP_TO_STEP",
  "SET_VALUE",
  "REDIRECT_OR_CUSTOM_THANK_YOU",
] as const
export type LogicActionType = (typeof LOGIC_ACTIONS)[number]

export interface LogicAction {
  id: string
  type: LogicActionType
  /** SHOW/HIDE/REQUIRE/SET_VALUE target */
  targetFieldId?: string
  /** JUMP_TO_STEP target: step id (the step_break field id, "__start" for the first step) or "__end" */
  targetStepId?: string
  /** SET_VALUE: literal value or arithmetic expression using {{field_key}} tokens when `calculate` is true */
  value?: string
  calculate?: boolean
  /** REDIRECT_OR_CUSTOM_THANK_YOU */
  redirectUrl?: string
  thankYouTitle?: string
  thankYouMessage?: string
}

export interface LogicRule {
  id: string
  name: string
  enabled: boolean
  combinator: "AND" | "OR"
  conditions: LogicCondition[]
  actions: LogicAction[]
}

/* ───────────── Quiz ───────────── */

export interface QuizOutcome {
  id: string
  minScore: number
  maxScore: number
  title: string
  message: string
}

export interface QuizConfig {
  showLiveScore: boolean
  revealScore: boolean
  outcomes: QuizOutcome[]
}

/* ───────────── Schema ───────────── */

export interface FormSchema {
  version: 1
  fields: FormField[]
  logic: LogicRule[]
  quiz: QuizConfig
  stepper: {
    progressStyle: "bar" | "steps" | "percentage"
    showStepTitles: boolean
    nextLabel: string
    backLabel: string
  }
  /** React Flow node positions for the logic canvas */
  logicLayout?: Record<string, { x: number; y: number }>
}

/* ───────────── Theme ───────────── */

export interface ThemeColors {
  primary: string
  primaryText: string
  background: string
  surface: string
  text: string
  muted: string
  border: string
  error: string
}

export interface CustomFont {
  /** CSS family name used in fontFamily / headingFont */
  family: string
  /** base64 data URL (woff2, woff, ttf or otf) */
  dataUrl: string
  format: "woff2" | "woff" | "truetype" | "opentype"
}

export interface ThemeConfig {
  preset: string
  /** Any Google Fonts family name, or the family of an uploaded custom font */
  fontFamily: string
  headingFont?: string
  headingSize: number
  bodySize: number
  colors: ThemeColors
  logoUrl?: string
  coverUrl?: string
  maxWidth: number
  radius: number
  density: "compact" | "comfortable" | "spacious"
  buttonText: string
  customCss: string
  /** Self-hosted font files uploaded in the theme editor */
  customFonts?: CustomFont[]
}

/* ───────────── Settings ───────────── */

export interface FormSettings {
  successTitle: string
  successMessage: string
  ctaLabel?: string
  ctaUrl?: string
  redirectEnabled: boolean
  redirectUrl?: string
  redirectDelay: number
  forwardParams: boolean
  showReceipt: boolean
  opensAt?: string | null
  closesAt?: string | null
  maxSubmissions?: number | null
  closedMessage: string
  passwordEnabled: boolean
  /** bcrypt hash — never sent to the client */
  passwordHash?: string | null
  allowedDomains: string[]
  honeypot: boolean
  minSubmitSeconds: number
  notifyEmails: string[]
  /** Email field whose answer receives the thank-you (auto-reply) email */
  respondentEmailFieldId?: string | null
  autoReply: AutoReplySettings
  webhooksEnabled: boolean
  hideBadge: boolean
  /** Let respondents save progress and continue later via a private link */
  saveAndResume: boolean
  /** Days a resume link stays valid */
  resumeTtlDays: number
  /** Workspace EmailTemplate used for new-response notifications (null = built-in design) */
  notifyTemplateId: string | null
}

/** Respondent thank-you email. Strings support {{field_key}} merge tags. */
export interface AutoReplySettings {
  enabled: boolean
  subject: string
  heading: string
  body: string
  includeAnswers: boolean
  /** Sender display name; falls back to the form title */
  fromName: string
  /** Reply-To address; falls back to the first notification address */
  replyTo: string
  /** Workspace EmailTemplate with the client's own HTML (null = built-in design) */
  templateId: string | null
}

export type PublicFormSettings = Omit<FormSettings, "passwordHash" | "notifyEmails" | "autoReply" | "notifyTemplateId">

export interface Step {
  /** "__start" for the implicit first step, otherwise the step_break field id */
  id: string
  index: number
  title: string
  description?: string
  fields: FormField[]
}
