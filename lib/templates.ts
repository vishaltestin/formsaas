import {
  defaultSchema,
  defaultSettings,
  defaultTheme,
  slugifyKey,
  type FieldOption,
  type FormField,
  type FormMode,
  type FormSchema,
  type FormSettings,
  type LogicRule,
  type ThemeConfig,
} from "@/lib/form-engine"

export interface FormTemplate {
  id: string
  name: string
  description: string
  category: string
  mode: FormMode
  highlights: string[]
  schema: FormSchema
  theme: ThemeConfig
  settings: FormSettings
}

/* ───────── helpers (deterministic ids so templates are reproducible) ───────── */

const o = (id: string, label: string, points?: number, imageUrl?: string): FieldOption => ({
  id,
  label,
  value: slugifyKey(label),
  ...(points !== undefined ? { points } : {}),
  ...(imageUrl !== undefined ? { imageUrl } : {}),
})

const f = (field: Omit<FormField, "width"> & { width?: FormField["width"] }): FormField => ({
  width: "full",
  required: false,
  ...field,
})

function svgTile(label: string, bg: string, fg: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200' viewBox='0 0 320 200'><rect width='320' height='200' fill='${bg}'/><circle cx='250' cy='60' r='70' fill='${fg}' opacity='0.18'/><rect x='24' y='130' width='120' height='10' rx='5' fill='${fg}' opacity='0.5'/><text x='24' y='112' font-family='Arial' font-size='26' font-weight='700' fill='${fg}'>${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/* ───────── 1. SaaS Lead Qualification (Stepper + logic) ───────── */

function leadQualification(): FormTemplate {
  const schema = defaultSchema()
  schema.stepper = { progressStyle: "steps", showStepTitles: true, nextLabel: "Continue", backLabel: "Back" }
  schema.fields = [
    f({ id: "lq_intro", key: "intro", type: "paragraph", label: "Intro", props: { content: "Tell us a little about your team and we'll match you with the right plan and specialist." } }),
    f({ id: "lq_first", key: "first_name", type: "short_text", label: "First name", placeholder: "Ada", required: true, width: "half", validation: { minLength: 2 } }),
    f({ id: "lq_last", key: "last_name", type: "short_text", label: "Last name", placeholder: "Lovelace", required: true, width: "half" }),
    f({ id: "lq_email", key: "work_email", type: "email", label: "Work email", placeholder: "ada@company.com", required: true, helpText: "We'll only use this to follow up on your request." }),
    f({ id: "lq_company", key: "company", type: "short_text", label: "Company", placeholder: "Analytical Engines Ltd", required: true, width: "half" }),
    f({ id: "lq_website", key: "website", type: "url", label: "Company website", placeholder: "https://", width: "half" }),
    f({ id: "lq_step2", key: "step_company", type: "step_break", label: "Your team", props: { content: "Size and goals" } }),
    f({
      id: "lq_size", key: "team_size", type: "radio", label: "How big is your team?", required: true,
      options: [o("ls1", "1–10"), o("ls2", "11–50"), o("ls3", "51–200"), o("ls4", "200+")],
    }),
    f({
      id: "lq_usecase", key: "use_case", type: "checkboxes", label: "What will you use Digital Fueled for?", required: true,
      options: [o("lu1", "Lead capture"), o("lu2", "Customer feedback"), o("lu3", "Internal workflows"), o("lu4", "Surveys & research")],
      validation: { minSelected: 1 },
    }),
    f({
      id: "lq_budget", key: "budget", type: "select", label: "Monthly budget", required: true, placeholder: "Select a range",
      options: [o("lb1", "Under $100"), o("lb2", "$100 – $1,000"), o("lb3", "$1,000+")],
    }),
    f({ id: "lq_seats", key: "seats", type: "number", label: "How many seats do you need?", placeholder: "250", helpText: "Shown for larger teams.", validation: { min: 50, max: 100000 } }),
    f({ id: "lq_step3", key: "step_enterprise", type: "step_break", label: "Enterprise needs", props: { content: "Security & rollout" } }),
    f({
      id: "lq_sso", key: "needs_sso", type: "yes_no", label: "Do you require SSO / SAML?", required: true,
      props: { yesLabel: "Yes", noLabel: "No" },
    }),
    f({ id: "lq_timeline", key: "timeline", type: "date", label: "Target go-live date", validation: { dateRule: "future" } }),
    f({ id: "lq_step4", key: "step_final", type: "step_break", label: "Final details", props: { content: "Almost done" } }),
    f({ id: "lq_notes", key: "notes", type: "long_text", label: "Anything else we should know?", placeholder: "Integrations, compliance, deadlines…", props: { rows: 4 }, validation: { maxLength: 1000 } }),
    f({ id: "lq_utm", key: "utm_source", type: "hidden", label: "UTM source", props: { paramName: "utm_source" } }),
    f({ id: "lq_tier", key: "lead_tier", type: "hidden", label: "Lead tier (calculated)", props: { paramName: "" } }),
  ]
  const logic: LogicRule[] = [
    {
      id: "lr_seats", name: "Ask seats for 51+ teams", enabled: true, combinator: "OR",
      conditions: [
        { id: "lc1", fieldId: "lq_size", operator: "equals", value: "51_200" },
        { id: "lc2", fieldId: "lq_size", operator: "equals", value: "200" },
      ],
      actions: [
        { id: "la1", type: "SHOW_FIELD", targetFieldId: "lq_seats" },
        { id: "la2", type: "REQUIRE_FIELD", targetFieldId: "lq_seats" },
      ],
    },
    {
      id: "lr_skip", name: "Small budgets skip enterprise step", enabled: true, combinator: "AND",
      conditions: [{ id: "lc3", fieldId: "lq_budget", operator: "equals", value: "under_100" }],
      actions: [
        { id: "la3", type: "JUMP_TO_STEP", targetStepId: "lq_step4" },
        { id: "la4", type: "SET_VALUE", targetFieldId: "lq_tier", value: "self-serve" },
      ],
    },
    {
      id: "lr_ent", name: "Tag enterprise leads", enabled: true, combinator: "AND",
      conditions: [{ id: "lc4", fieldId: "lq_budget", operator: "equals", value: "1_000" }],
      actions: [
        { id: "la5", type: "SET_VALUE", targetFieldId: "lq_tier", value: "enterprise" },
        { id: "la6", type: "REDIRECT_OR_CUSTOM_THANK_YOU", thankYouTitle: "You're on the fast track, {{first_name}}", thankYouMessage: "An enterprise specialist will reach out to {{work_email}} within one business day." },
      ],
    },
  ]
  schema.logic = logic
  schema.logicLayout = {}
  const settings = defaultSettings()
  settings.successTitle = "Thanks, {{first_name}}!"
  settings.successMessage = "We received your details for {{company}}. Our team will be in touch at {{work_email}}."
  settings.ctaLabel = "Explore the docs"
  settings.ctaUrl = "https://example.com/docs"
  return {
    id: "saas-lead-qualification",
    name: "SaaS Lead Qualification",
    description: "Multi-step lead capture that adapts to team size and budget, tags tiers and routes enterprise leads.",
    category: "Sales",
    mode: "STEPPER",
    highlights: ["Stepper", "Conditional logic", "Calculated tier"],
    schema,
    theme: defaultTheme("harbor"),
    settings,
  }
}

/* ───────── 2. Customer NPS & Feedback (Card) ───────── */

function npsFeedback(): FormTemplate {
  const schema = defaultSchema()
  schema.fields = [
    f({ id: "np_score", key: "nps", type: "scale", label: "How likely are you to recommend us to a friend or colleague?", required: true, props: { scaleMin: 0, scaleMax: 10, minLabel: "Not at all likely", maxLabel: "Extremely likely", nps: true } }),
    f({
      id: "np_reason", key: "primary_reason", type: "radio", label: "What's the main reason for your score?", required: true,
      options: [o("nr1", "Product quality"), o("nr2", "Customer support"), o("nr3", "Pricing"), o("nr4", "Ease of use")],
    }),
    f({ id: "np_improve", key: "improve", type: "long_text", label: "What's one thing we could do better?", placeholder: "Be as candid as you like…", props: { rows: 3 } }),
    f({ id: "np_love", key: "love", type: "long_text", label: "What do you love most?", placeholder: "Tell us what's working…", props: { rows: 3 } }),
    f({ id: "np_rating", key: "support_rating", type: "rating", label: "How would you rate our support team?", props: { maxRating: 5 } }),
    f({ id: "np_contact", key: "can_contact", type: "yes_no", label: "May we follow up with you about your feedback?", props: { yesLabel: "Sure", noLabel: "No thanks" } }),
    f({ id: "np_email", key: "email", type: "email", label: "Where can we reach you?", placeholder: "you@example.com" }),
  ]
  schema.logic = [
    {
      id: "nr_detractor", name: "Detractors: ask what to improve", enabled: true, combinator: "AND",
      conditions: [{ id: "nc1", fieldId: "np_score", operator: "less_than", value: "7" }],
      actions: [{ id: "na1", type: "SHOW_FIELD", targetFieldId: "np_improve" }, { id: "na1b", type: "REQUIRE_FIELD", targetFieldId: "np_improve" }],
    },
    {
      id: "nr_promoter", name: "Promoters: ask what they love", enabled: true, combinator: "AND",
      conditions: [{ id: "nc2", fieldId: "np_score", operator: "greater_than", value: "8" }],
      actions: [{ id: "na2", type: "SHOW_FIELD", targetFieldId: "np_love" }],
    },
    {
      id: "nr_contact", name: "Collect email when allowed", enabled: true, combinator: "AND",
      conditions: [{ id: "nc3", fieldId: "np_contact", operator: "equals", value: "true" }],
      actions: [{ id: "na3", type: "SHOW_FIELD", targetFieldId: "np_email" }, { id: "na4", type: "REQUIRE_FIELD", targetFieldId: "np_email" }],
    },
  ]
  const settings = defaultSettings()
  settings.successTitle = "Thank you for the feedback"
  settings.successMessage = "You rated us {{nps}}/10. Every response is read by our product team."
  return {
    id: "customer-nps-feedback",
    name: "Customer NPS & Feedback",
    description: "Conversational one-question-at-a-time NPS survey with keyboard shortcuts and adaptive follow-ups.",
    category: "Feedback",
    mode: "CARD",
    highlights: ["Card mode", "NPS", "Keyboard navigation"],
    schema,
    theme: defaultTheme("midnight"),
    settings,
  }
}

/* ───────── 3. Product Knowledge Assessment (Quiz) ───────── */

function knowledgeQuiz(): FormTemplate {
  const schema = defaultSchema()
  schema.quiz = {
    showLiveScore: true,
    revealScore: true,
    outcomes: [
      { id: "qo1", minScore: 0, maxScore: 19, title: "Getting started", message: "You scored {{score}}/{{max_score}}. Review the onboarding guide and try again — you've got this!" },
      { id: "qo2", minScore: 20, maxScore: 34, title: "Solid foundation", message: "Nice work, {{name}} — {{score}}/{{max_score}}. You know the essentials; dig into advanced logic next." },
      { id: "qo3", minScore: 35, maxScore: 1000, title: "Certified expert", message: "Outstanding! {{score}}/{{max_score}}. You're ready to lead Digital Fueled rollouts." },
    ],
  }
  schema.stepper.progressStyle = "percentage"
  schema.fields = [
    f({ id: "kq_name", key: "name", type: "short_text", label: "Your name", required: true, placeholder: "Jane Doe", width: "half" }),
    f({ id: "kq_email", key: "email", type: "email", label: "Email", required: true, width: "half" }),
    f({ id: "kq_s1", key: "step_basics", type: "step_break", label: "Basics" }),
    f({
      id: "kq_q1", key: "q_modes", type: "radio", label: "Which mode shows one question at a time?", required: true,
      options: [o("q1a", "Classic", 0), o("q1b", "Stepper", 0), o("q1c", "Card", 10), o("q1d", "Quiz", 0)],
    }),
    f({
      id: "kq_q2", key: "q_embed", type: "radio", label: "Which embed auto-resizes its height?", required: true,
      options: [o("q2a", "Iframe embed with resize messaging", 10), o("q2b", "Plain link", 0), o("q2c", "QR code", 0)],
    }),
    f({ id: "kq_s2", key: "step_advanced", type: "step_break", label: "Advanced" }),
    f({
      id: "kq_q3", key: "q_logic", type: "checkboxes", label: "Which are valid logic actions? (select all)", required: true,
      options: [o("q3a", "Show field", 5), o("q3b", "Jump to step", 5), o("q3c", "Delete database", -5), o("q3d", "Set value", 5)],
    }),
    f({
      id: "kq_q4", key: "q_piping", type: "select", label: "How do you pipe an answer into the thank-you message?", required: true, placeholder: "Choose…",
      options: [o("q4a", "{{field_key}}", 10), o("q4b", "$field", 0), o("q4c", "%field%", 0)],
    }),
    f({ id: "kq_conf", key: "confidence", type: "rating", label: "How confident do you feel?", props: { maxRating: 5 } }),
  ]
  const settings = defaultSettings()
  settings.successTitle = "Quiz complete"
  settings.successMessage = "Thanks {{name}}! Your score: {{score}}/{{max_score}}."
  return {
    id: "product-knowledge-assessment",
    name: "Product Knowledge Assessment",
    description: "Scored quiz with weighted answers, a live score badge and outcome messages by score band.",
    category: "Education",
    mode: "QUIZ",
    highlights: ["Quiz scoring", "Outcomes", "Live score"],
    schema,
    theme: defaultTheme("fern"),
    settings,
  }
}

/* ───────── 4. Contact & Support Inquiry (Classic 2-col + file) ───────── */

function contactSupport(): FormTemplate {
  const schema = defaultSchema()
  schema.fields = [
    f({ id: "cs_head", key: "heading_contact", type: "heading", label: "How can we help?", props: { level: 2, content: "Our support team replies within 4 business hours." } }),
    f({ id: "cs_name", key: "full_name", type: "short_text", label: "Full name", required: true, placeholder: "Alex Morgan", width: "half" }),
    f({ id: "cs_email", key: "email", type: "email", label: "Email", required: true, placeholder: "alex@company.com", width: "half" }),
    f({ id: "cs_phone", key: "phone", type: "phone", label: "Phone", placeholder: "+1 555 010 2030", width: "half" }),
    f({ id: "cs_company", key: "company", type: "short_text", label: "Company", placeholder: "Acme Inc.", width: "half" }),
    f({
      id: "cs_topic", key: "topic", type: "select", label: "Topic", required: true, placeholder: "Select a topic", width: "half",
      options: [o("ct1", "Billing"), o("ct2", "Technical issue"), o("ct3", "Feature request"), o("ct4", "Partnership")],
    }),
    f({
      id: "cs_priority", key: "priority", type: "radio", label: "Priority", required: true, width: "half",
      options: [o("cp1", "Low"), o("cp2", "Normal"), o("cp3", "Urgent")],
    }),
    f({ id: "cs_msg", key: "message", type: "long_text", label: "Message", required: true, placeholder: "Describe your question or issue…", props: { rows: 5 }, validation: { minLength: 20, maxLength: 2000 } }),
    f({ id: "cs_file", key: "attachment", type: "file", label: "Attachment", helpText: "Screenshots or PDFs up to 5 MB.", validation: { maxFileMb: 5, accept: ["image/*", "application/pdf"] } }),
    f({ id: "cs_consent", key: "consent", type: "consent", label: "Privacy", required: true, props: { consentText: "I agree to be contacted about this request.", linkUrl: "", linkLabel: "" } }),
  ]
  const settings = defaultSettings()
  settings.successTitle = "Message received"
  settings.successMessage = "Thanks {{full_name}} — we'll reply to {{email}} about your {{topic}} request shortly."
  return {
    id: "contact-support-inquiry",
    name: "Contact & Support Inquiry",
    description: "Modern two-column contact form with topic routing, priority and secure file attachments.",
    category: "Support",
    mode: "CLASSIC",
    highlights: ["2-column layout", "File upload", "Piping"],
    schema,
    theme: defaultTheme("studio"),
    settings,
  }
}

/* ───────── 5. Event Registration (Stepper with date/selection & piping) ───────── */

function eventRegistration(): FormTemplate {
  const schema = defaultSchema()
  schema.stepper = { progressStyle: "bar", showStepTitles: true, nextLabel: "Next", backLabel: "Back" }
  schema.fields = [
    f({ id: "ev_banner", key: "banner", type: "image", label: "Banner", props: { imageUrl: svgTile("Design Systems Summit 2026", "#fff1e6", "#9a3412"), alt: "Event banner" } }),
    f({ id: "ev_first", key: "first_name", type: "short_text", label: "First name", required: true, width: "half" }),
    f({ id: "ev_last", key: "last_name", type: "short_text", label: "Last name", required: true, width: "half" }),
    f({ id: "ev_email", key: "email", type: "email", label: "Email", required: true }),
    f({ id: "ev_s2", key: "step_tickets", type: "step_break", label: "Tickets", props: { content: "Choose your pass" } }),
    f({
      id: "ev_ticket", key: "ticket", type: "image_choice", label: "Pass type", required: true,
      options: [
        o("et1", "General", undefined, svgTile("General", "#f5f5f4", "#44403c")),
        o("et2", "VIP", undefined, svgTile("VIP", "#fef3c7", "#92400e")),
        o("et3", "Virtual", undefined, svgTile("Virtual", "#e0f2fe", "#075985")),
      ],
    }),
    f({ id: "ev_qty", key: "quantity", type: "number", label: "Number of tickets", required: true, defaultValue: 1, width: "half", validation: { min: 1, max: 10 } }),
    f({ id: "ev_date", key: "arrival_date", type: "date", label: "Arrival date", required: true, width: "half", validation: { dateMin: "2026-01-01", dateMax: "2027-12-31" } }),
    f({
      id: "ev_sessions", key: "sessions", type: "multi_select", label: "Workshops you'd like to attend",
      options: [o("es1", "Tokens & theming"), o("es2", "Accessible components"), o("es3", "Design-to-code"), o("es4", "Governance")],
      validation: { maxSelected: 2 },
    }),
    f({ id: "ev_s3", key: "step_extras", type: "step_break", label: "Extras" }),
    f({
      id: "ev_diet", key: "diet", type: "radio", label: "Dietary preference",
      options: [o("ed1", "No preference"), o("ed2", "Vegetarian"), o("ed3", "Vegan"), o("ed4", "Gluten free")],
    }),
    f({ id: "ev_arrive", key: "arrival_time", type: "time", label: "Expected arrival time", width: "half" }),
    f({ id: "ev_ref", key: "ref", type: "hidden", label: "Referral", props: { paramName: "ref" } }),
  ]
  schema.logic = [
    {
      id: "er_virtual", name: "Virtual pass skips extras", enabled: true, combinator: "AND",
      conditions: [{ id: "ec1", fieldId: "ev_ticket", operator: "equals", value: "virtual" }],
      actions: [{ id: "ea1", type: "JUMP_TO_STEP", targetStepId: "__end" }],
    },
  ]
  const settings = defaultSettings()
  settings.successTitle = "See you there, {{first_name}}!"
  settings.successMessage = "Your {{ticket}} pass ×{{quantity}} is reserved for {{arrival_date}}. A confirmation is on its way to {{email}}."
  settings.showReceipt = true
  return {
    id: "event-registration",
    name: "Event Registration & Tickets",
    description: "Stepper registration with image-choice passes, date selection, workshop picks and piped confirmation.",
    category: "Events",
    mode: "STEPPER",
    highlights: ["Stepper", "Image choice", "Answer piping"],
    schema,
    theme: defaultTheme("terracotta"),
    settings,
  }
}

/* ───────── 6. Client Onboarding & E-Signature (Classic) ───────── */

function clientOnboarding(): FormTemplate {
  const schema = defaultSchema()
  schema.fields = [
    f({ id: "co_head", key: "heading_onboarding", type: "heading", label: "Client onboarding", props: { level: 2, content: "A few details before we kick off your engagement." } }),
    f({ id: "co_company", key: "company", type: "short_text", label: "Legal company name", required: true, width: "half" }),
    f({ id: "co_contact", key: "contact_name", type: "short_text", label: "Primary contact", required: true, width: "half" }),
    f({ id: "co_email", key: "email", type: "email", label: "Billing email", required: true, width: "half" }),
    f({ id: "co_phone", key: "phone", type: "phone", label: "Phone", width: "half" }),
    f({ id: "co_start", key: "start_date", type: "date", label: "Preferred start date", required: true, width: "half", validation: { dateRule: "future" } }),
    f({
      id: "co_services", key: "services", type: "checkboxes", label: "Services in scope", required: true, width: "half",
      options: [o("cv1", "Brand strategy"), o("cv2", "Product design"), o("cv3", "Engineering"), o("cv4", "Analytics")],
    }),
    f({ id: "co_div", key: "divider_1", type: "divider", label: "Divider" }),
    f({
      id: "co_matrix", key: "priorities", type: "matrix", label: "Rank your priorities",
      props: {
        matrixRows: [{ id: "mr1", label: "Speed" }, { id: "mr2", label: "Quality" }, { id: "mr3", label: "Budget" }],
        matrixColumns: [{ id: "mc1", label: "Low" }, { id: "mc2", label: "Medium" }, { id: "mc3", label: "High" }],
      },
    }),
    f({ id: "co_terms", key: "terms_text", type: "paragraph", label: "Terms", props: { content: "By signing below you confirm the statement of work and agree to our master services agreement." } }),
    f({ id: "co_consent", key: "agree_terms", type: "consent", label: "Agreement", required: true, props: { consentText: "I have read and accept the master services agreement.", linkUrl: "https://example.com/msa", linkLabel: "View MSA" } }),
    f({ id: "co_sign", key: "signature", type: "signature", label: "Authorized signature", required: true }),
  ]
  const settings = defaultSettings()
  settings.successTitle = "Welcome aboard, {{contact_name}}"
  settings.successMessage = "{{company}} is officially onboarded. We'll kick off on {{start_date}}."
  settings.showReceipt = true
  return {
    id: "client-onboarding-esignature",
    name: "Client Onboarding & E-Signature",
    description: "Classic onboarding packet with a priorities matrix, consent and a legally styled signature pad.",
    category: "Operations",
    mode: "CLASSIC",
    highlights: ["Signature pad", "Consent", "Matrix grid"],
    schema,
    theme: defaultTheme("studio"),
    settings,
  }
}


/* ───────── 7. Vendor KYC & Onboarding (Stepper, India-ready) ───────── */

function vendorKyc(): FormTemplate {
  const schema = defaultSchema()
  schema.stepper = { progressStyle: "steps", showStepTitles: true, nextLabel: "Continue", backLabel: "Back" }
  schema.fields = [
    f({ id: "vk_name", key: "contact_name", type: "full_name", label: "Authorised contact", required: true, props: { showTitle: true } }),
    f({ id: "vk_email", key: "work_email", type: "email", label: "Work email", required: true, width: "half", validation: { businessEmail: true } }),
    f({ id: "vk_phone", key: "phone", type: "phone", label: "Mobile", required: true, width: "half", props: { countryCode: true, defaultCountry: "IN" } }),
    f({ id: "vk_step2", key: "step_business", type: "step_break", label: "Business details" }),
    f({ id: "vk_legal", key: "legal_name", type: "short_text", label: "Registered business name", required: true }),
    f({ id: "vk_gstin", key: "gstin", type: "short_text", label: "GSTIN", required: true, width: "half", placeholder: "27AAPFU0939F1ZV", validation: { format: "gstin" } }),
    f({ id: "vk_pan", key: "pan", type: "short_text", label: "Company PAN", required: true, width: "half", placeholder: "ABCPE1234F", validation: { format: "pan" } }),
    f({ id: "vk_country", key: "country", type: "country", label: "Country of incorporation", required: true, width: "half", defaultValue: "IN" }),
    f({ id: "vk_turnover", key: "annual_turnover", type: "currency", label: "Annual turnover", width: "half", props: { currency: "INR", decimals: 0 }, validation: { min: 0 } }),
    f({ id: "vk_address", key: "registered_address", type: "address", label: "Registered address", required: true, props: { showLine2: true, showState: true, defaultCountry: "IN" } }),
    f({ id: "vk_step3", key: "step_bank", type: "step_break", label: "Payment & consent" }),
    f({ id: "vk_ifsc", key: "ifsc", type: "short_text", label: "Bank IFSC", required: true, width: "half", placeholder: "HDFC0001234", validation: { format: "ifsc" } }),
    f({ id: "vk_acct", key: "account_number", type: "short_text", label: "Account number", required: true, width: "half", validation: { pattern: "^[0-9]{9,18}$", messages: { pattern: "Enter 9 to 18 digits" } } }),
    f({ id: "vk_docs", key: "documents", type: "file", label: "GST certificate or cancelled cheque", validation: { accept: ["application/pdf", "image/*"], maxFileMb: 5 } }),
    f({ id: "vk_consent", key: "consent", type: "consent", label: "Declaration", required: true, props: { consentText: "I confirm the details above are accurate and I am authorised to share them." } }),
    f({ id: "vk_sign", key: "signature", type: "signature", label: "Signature", required: true }),
  ]
  const settings = defaultSettings()
  settings.successTitle = "Thanks, we have your details"
  settings.successMessage = "Our finance team will verify {{legal_name}} and email {{work_email}} within two business days."
  settings.showReceipt = true
  return {
    id: "vendor-kyc-onboarding",
    name: "Vendor KYC & Onboarding",
    description: "Three-step supplier onboarding with GSTIN, PAN and IFSC checks, a structured address and country-coded phone.",
    category: "Operations",
    mode: "STEPPER",
    highlights: ["GSTIN / PAN / IFSC", "Address & country", "Currency"],
    schema,
    theme: defaultTheme("studio"),
    settings,
  }
}

/* ───────── 8. Consultation Booking (Classic, appointments) ───────── */

function consultationBooking(): FormTemplate {
  const schema = defaultSchema()
  schema.fields = [
    f({ id: "cb_head", key: "heading_booking", type: "heading", label: "Book a consultation", props: { level: 2, content: "Pick a 30-minute slot. Each slot can only be booked once." } }),
    f({ id: "cb_name", key: "name", type: "full_name", label: "Your name", required: true }),
    f({ id: "cb_email", key: "email", type: "email", label: "Email", required: true, width: "half" }),
    f({ id: "cb_phone", key: "phone", type: "phone", label: "Phone", width: "half", props: { countryCode: true, defaultCountry: "IN" } }),
    f({
      id: "cb_slot", key: "slot", type: "appointment", label: "Choose a time", required: true,
      props: { slotStart: "10:00", slotEnd: "17:00", slotMinutes: 30, daysAhead: 21, weekdays: [1, 2, 3, 4, 5], exclusiveSlots: true },
    }),
    f({ id: "cb_window", key: "project_window", type: "date_range", label: "Project window", width: "half", validation: { dateRule: "future" } }),
    f({ id: "cb_budget", key: "budget", type: "slider", label: "Budget (lakh ₹)", width: "half", props: { scaleMin: 1, scaleMax: 50, step: 1, prefix: "₹", suffix: "L", minLabel: "1L", maxLabel: "50L+" } }),
    f({
      id: "cb_rank", key: "priorities", type: "ranking", label: "Rank what matters most",
      options: [o("cbr1", "Speed to launch"), o("cbr2", "Cost"), o("cbr3", "Quality"), o("cbr4", "Ongoing support")],
    }),
    f({ id: "cb_notes", key: "notes", type: "long_text", label: "Anything we should know?", validation: { maxLength: 1000 } }),
  ]
  const settings = defaultSettings()
  settings.successTitle = "You're booked, {{name}}"
  settings.successMessage = "A calendar invite is on its way to {{email}}."
  settings.showReceipt = true
  return {
    id: "consultation-booking",
    name: "Consultation Booking",
    description: "Appointment slots that can't be double-booked, a budget slider, date range and drag-to-rank priorities.",
    category: "Sales",
    mode: "CLASSIC",
    highlights: ["Appointment slots", "Slider", "Ranking"],
    schema,
    theme: defaultTheme("studio"),
    settings,
  }
}

export const TEMPLATES: FormTemplate[] = [
  leadQualification(),
  npsFeedback(),
  knowledgeQuiz(),
  contactSupport(),
  eventRegistration(),
  clientOnboarding(),
  vendorKyc(),
  consultationBooking(),
]

export function getTemplate(id: string) {
  const t = TEMPLATES.find((x) => x.id === id)
  return t ? (structuredClone(t) as FormTemplate) : null
}
