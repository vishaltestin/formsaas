import type { FieldType, FormField, FormMode } from "./types"
import { uid } from "./id"
import { APPOINTMENT_DEFAULTS } from "./validators"

export type FieldCategory = "inputs" | "contact" | "selection" | "rating" | "date" | "rich" | "layout"

export interface FieldDefinition {
  type: FieldType
  label: string
  description: string
  category: FieldCategory
  /** Accepts user input (vs. a static layout block) */
  isInput: boolean
  /** Supports an options list */
  hasOptions?: boolean
  /** Options can carry quiz points */
  scorable?: boolean
  keywords?: string
  /** Restricts the block to these form modes (palette visibility) */
  modes?: FormMode[]
}

export const FIELD_CATEGORIES: { id: FieldCategory; label: string }[] = [
  { id: "inputs", label: "Inputs" },
  { id: "contact", label: "Contact & Identity" },
  { id: "selection", label: "Selection" },
  { id: "rating", label: "Rating & Scales" },
  { id: "date", label: "Date & Scheduling" },
  { id: "rich", label: "Files & Advanced" },
  { id: "layout", label: "Layout Blocks" },
]

export const FIELD_DEFINITIONS: Record<FieldType, FieldDefinition> = {
  short_text: { type: "short_text", label: "Short Text", description: "Single line answer", category: "inputs", isInput: true, keywords: "text input name" },
  long_text: { type: "long_text", label: "Long Text", description: "Multi-line paragraph", category: "inputs", isInput: true, keywords: "textarea comment message" },
  email: { type: "email", label: "Email", description: "Validated, optional business-only", category: "contact", isInput: true, keywords: "mail contact" },
  phone: { type: "phone", label: "Phone", description: "Country code + number", category: "contact", isInput: true, keywords: "mobile tel country code dial whatsapp" },
  full_name: { type: "full_name", label: "Full Name", description: "Title, first, middle, last", category: "contact", isInput: true, keywords: "first last name person" },
  address: { type: "address", label: "Address", description: "Street, city, postal code, country", category: "contact", isInput: true, keywords: "street city zip pin postal location" },
  currency: { type: "currency", label: "Currency", description: "Amount in INR, USD, EUR…", category: "inputs", isInput: true, keywords: "money price budget amount rupee dollar" },
  color: { type: "color", label: "Color Picker", description: "Hex colour value", category: "inputs", isInput: true, keywords: "colour brand hex" },
  number: { type: "number", label: "Number", description: "Numeric value with bounds", category: "inputs", isInput: true, keywords: "amount quantity" },
  url: { type: "url", label: "URL", description: "Website link", category: "inputs", isInput: true, keywords: "link website" },
  password: { type: "password", label: "Password", description: "Masked secret input", category: "inputs", isInput: true, keywords: "secret" },
  select: { type: "select", label: "Single Select", description: "Dropdown with one choice", category: "selection", isInput: true, hasOptions: true, scorable: true, keywords: "dropdown" },
  multi_select: { type: "multi_select", label: "Multi-Select", description: "Pick several from a list", category: "selection", isInput: true, hasOptions: true, scorable: true, keywords: "tags multiple" },
  radio: { type: "radio", label: "Radio Group", description: "One choice, all visible", category: "selection", isInput: true, hasOptions: true, scorable: true, keywords: "single choice" },
  checkboxes: { type: "checkboxes", label: "Checkboxes", description: "Multiple choices", category: "selection", isInput: true, hasOptions: true, scorable: true, keywords: "multiple choice" },
  yes_no: { type: "yes_no", label: "Yes / No", description: "Boolean switch", category: "selection", isInput: true, keywords: "boolean toggle switch" },
  image_choice: { type: "image_choice", label: "Image Choice", description: "Pick a visual option", category: "selection", isInput: true, hasOptions: true, scorable: true, keywords: "picture visual" },
  country: { type: "country", label: "Country", description: "All countries, searchable", category: "contact", isInput: true, keywords: "nation region location" },
  ranking: { type: "ranking", label: "Ranking", description: "Order options by preference", category: "selection", isInput: true, hasOptions: true, keywords: "order priority sort rank" },
  rating: { type: "rating", label: "Star Rating", description: "1–N stars", category: "rating", isInput: true, keywords: "stars review" },
  scale: { type: "scale", label: "Linear Scale / NPS", description: "Numbered scale", category: "rating", isInput: true, keywords: "nps likert score" },
  slider: { type: "slider", label: "Slider", description: "Drag to pick a value", category: "rating", isInput: true, keywords: "range percent budget" },
  matrix: { type: "matrix", label: "Matrix Grid", description: "Rows × columns", category: "rating", isInput: true, keywords: "grid likert table" },
  date: { type: "date", label: "Date Picker", description: "Calendar date, age limits", category: "date", isInput: true, keywords: "day calendar birthday dob age" },
  time: { type: "time", label: "Time Picker", description: "Time of day", category: "date", isInput: true, keywords: "hour clock" },
  datetime: { type: "datetime", label: "Date & Time", description: "Date with a time", category: "date", isInput: true, keywords: "timestamp when event" },
  date_range: { type: "date_range", label: "Date Range", description: "Start and end dates", category: "date", isInput: true, keywords: "from to period leave travel" },
  appointment: { type: "appointment", label: "Appointment", description: "Bookable time slots", category: "date", isInput: true, keywords: "booking schedule slot meeting calendar demo" },
  file: { type: "file", label: "File Upload", description: "Attach a document", category: "rich", isInput: true, keywords: "upload attachment document" },
  signature: { type: "signature", label: "Signature Pad", description: "Draw a signature", category: "rich", isInput: true, keywords: "sign esign" },
  consent: { type: "consent", label: "Consent / Terms", description: "Agreement checkbox", category: "rich", isInput: true, keywords: "terms gdpr agree" },
  hidden: { type: "hidden", label: "Hidden Field", description: "Reads a URL query param", category: "rich", isInput: true, keywords: "utm ref tracking param" },
  calculated: { type: "calculated", label: "Calculated", description: "Formula from other answers", category: "rich", isInput: true, keywords: "formula total price sum calc" },
  heading: { type: "heading", label: "Heading", description: "Section title", category: "layout", isInput: false, keywords: "title section" },
  paragraph: { type: "paragraph", label: "Paragraph", description: "Descriptive text", category: "layout", isInput: false, keywords: "text description" },
  divider: { type: "divider", label: "Divider", description: "Horizontal rule", category: "layout", isInput: false, keywords: "separator line" },
  image: { type: "image", label: "Image Banner", description: "Visual block", category: "layout", isInput: false, keywords: "picture banner" },
  video: { type: "video", label: "Video", description: "YouTube, Vimeo or Loom", category: "layout", isInput: false, keywords: "youtube vimeo loom embed media" },
  step_break: { type: "step_break", label: "Step Break", description: "Start a new step/page", category: "layout", isInput: false, keywords: "page break wizard", modes: ["STEPPER", "QUIZ"] },
}

export function isInputField(field: Pick<FormField, "type">) {
  return FIELD_DEFINITIONS[field.type]?.isInput ?? false
}

/** Whether a block type makes sense for the given form mode (used to filter the palette). */
export function fieldAvailableIn(type: FieldType, mode: FormMode) {
  const modes = FIELD_DEFINITIONS[type]?.modes
  return !modes || modes.includes(mode)
}

/** Fields that render as a visible input (excludes hidden fields). */
export function isVisibleInput(field: Pick<FormField, "type">) {
  return isInputField(field) && field.type !== "hidden"
}

export function slugifyKey(input: string) {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  return base || "field"
}

export function uniqueKey(base: string, taken: Set<string>) {
  let key = slugifyKey(base)
  if (/^[0-9]/.test(key)) key = `f_${key}`
  if (!taken.has(key)) return key
  let i = 2
  while (taken.has(`${key}_${i}`)) i++
  return `${key}_${i}`
}

const opt = (label: string, points?: number) => ({
  id: uid("opt"),
  label,
  value: slugifyKey(label),
  ...(points !== undefined ? { points } : {}),
})

/** Factory for a new field with sensible defaults. */
export function createField(type: FieldType, existingKeys: Set<string> = new Set()): FormField {
  const def = FIELD_DEFINITIONS[type]
  const id = uid("fld")
  const key = uniqueKey(def.label, existingKeys)
  const base: FormField = { id, key, type, label: def.label, width: "full", required: false }

  switch (type) {
    case "short_text":
      return { ...base, label: "Your answer", key: uniqueKey("answer", existingKeys), placeholder: "Type here…" }
    case "long_text":
      return { ...base, label: "Tell us more", key: uniqueKey("details", existingKeys), placeholder: "Write a few sentences…", props: { rows: 4 } }
    case "email":
      return { ...base, label: "Email address", key: uniqueKey("email", existingKeys), placeholder: "name@company.com" }
    case "phone":
      return { ...base, label: "Phone number", key: uniqueKey("phone", existingKeys), placeholder: "98765 43210", props: { countryCode: true, defaultCountry: "IN" } }
    case "full_name":
      return { ...base, label: "Full name", key: uniqueKey("full_name", existingKeys), props: { showTitle: false, showMiddle: false } }
    case "address":
      return { ...base, label: "Address", key: uniqueKey("address", existingKeys), props: { showLine2: true, showState: true, defaultCountry: "IN" } }
    case "country":
      return { ...base, label: "Country", key: uniqueKey("country", existingKeys), placeholder: "Select a country", props: { defaultCountry: "" } }
    case "currency":
      return { ...base, label: "Budget", key: uniqueKey("budget", existingKeys), placeholder: "0.00", props: { currency: "INR", decimals: 2 }, validation: { min: 0 } }
    case "color":
      return { ...base, label: "Brand colour", key: uniqueKey("color", existingKeys), defaultValue: "#2563eb" }
    case "slider":
      return { ...base, label: "How much?", key: uniqueKey("amount", existingKeys), props: { scaleMin: 0, scaleMax: 100, step: 5, suffix: "" } }
    case "ranking":
      return { ...base, label: "Rank these by priority", key: uniqueKey("ranking", existingKeys), options: [opt("Price"), opt("Quality"), opt("Support"), opt("Speed")] }
    case "datetime":
      return { ...base, label: "Date and time", key: uniqueKey("datetime", existingKeys) }
    case "date_range":
      return { ...base, label: "Dates", key: uniqueKey("dates", existingKeys) }
    case "appointment":
      return { ...base, label: "Book a time", key: uniqueKey("appointment", existingKeys), props: { ...APPOINTMENT_DEFAULTS, exclusiveSlots: true } }
    case "video":
      return { ...base, label: "Video", key: uniqueKey("video", existingKeys), props: { videoUrl: "" } }
    case "number":
      return { ...base, label: "Number", key: uniqueKey("number", existingKeys), placeholder: "0" }
    case "url":
      return { ...base, label: "Website", key: uniqueKey("website", existingKeys), placeholder: "https://" }
    case "password":
      return { ...base, label: "Password", key: uniqueKey("password", existingKeys), validation: { minLength: 8 } }
    case "select":
    case "radio":
      return { ...base, label: "Choose one", key: uniqueKey("choice", existingKeys), placeholder: "Select an option", options: [opt("Option A"), opt("Option B"), opt("Option C")] }
    case "multi_select":
    case "checkboxes":
      return { ...base, label: "Select all that apply", key: uniqueKey("choices", existingKeys), options: [opt("Option A"), opt("Option B"), opt("Option C")] }
    case "image_choice":
      return {
        ...base,
        label: "Pick a style",
        key: uniqueKey("style", existingKeys),
        options: [
          { ...opt("Minimal"), imageUrl: "" },
          { ...opt("Bold"), imageUrl: "" },
          { ...opt("Classic"), imageUrl: "" },
        ],
      }
    case "yes_no":
      return { ...base, label: "Do you agree?", key: uniqueKey("agree", existingKeys), props: { yesLabel: "Yes", noLabel: "No" } }
    case "rating":
      return { ...base, label: "How would you rate us?", key: uniqueKey("rating", existingKeys), props: { maxRating: 5 } }
    case "scale":
      return { ...base, label: "How likely are you to recommend us?", key: uniqueKey("score", existingKeys), props: { scaleMin: 0, scaleMax: 10, minLabel: "Not likely", maxLabel: "Very likely", nps: true } }
    case "matrix":
      return {
        ...base,
        label: "Rate each area",
        key: uniqueKey("matrix", existingKeys),
        props: {
          matrixRows: [
            { id: uid("row"), label: "Quality" },
            { id: uid("row"), label: "Support" },
          ],
          matrixColumns: [
            { id: uid("col"), label: "Poor" },
            { id: uid("col"), label: "Okay" },
            { id: uid("col"), label: "Great" },
          ],
        },
      }
    case "date":
      return { ...base, label: "Date", key: uniqueKey("date", existingKeys), placeholder: "Pick a date" }
    case "time":
      return { ...base, label: "Time", key: uniqueKey("time", existingKeys) }
    case "file":
      return { ...base, label: "Upload a file", key: uniqueKey("attachment", existingKeys), validation: { maxFileMb: 5, accept: ["image/*", "application/pdf"] } }
    case "signature":
      return { ...base, label: "Signature", key: uniqueKey("signature", existingKeys), required: true }
    case "consent":
      return { ...base, label: "Terms", key: uniqueKey("consent", existingKeys), required: true, props: { consentText: "I agree to the terms and privacy policy.", linkUrl: "", linkLabel: "Read terms" } }
    case "hidden":
      return { ...base, label: "UTM Source", key: uniqueKey("utm_source", existingKeys), props: { paramName: "utm_source" } }
    case "calculated":
      return { ...base, label: "Total", key: uniqueKey("total", existingKeys), props: { formula: "0", decimals: 2, prefix: "", suffix: "" } }
    case "heading":
      return { ...base, label: "Section title", key: uniqueKey("heading", existingKeys), props: { level: 2, content: "" } }
    case "paragraph":
      return { ...base, label: "Paragraph", key: uniqueKey("paragraph", existingKeys), props: { content: "Add helpful context for respondents here." } }
    case "divider":
      return { ...base, label: "Divider", key: uniqueKey("divider", existingKeys) }
    case "image":
      return { ...base, label: "Image", key: uniqueKey("image", existingKeys), props: { imageUrl: "", alt: "" } }
    case "step_break":
      return { ...base, label: "New step", key: uniqueKey("step", existingKeys), props: { content: "" } }
  }
}
