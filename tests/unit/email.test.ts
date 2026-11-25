import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { activeEmailProvider, mailtrapInboxId, parseAddress, providerDescription, withFromName } from "../../lib/email/providers"
import { defaultSettings, normalizeSettings, pipe, toPublicSettings, type FormSchema } from "../../lib/form-engine"

describe("thank-you email settings", () => {
  it("defaults to off with sensible copy", () => {
    const s = defaultSettings()
    assert.equal(s.autoReply.enabled, false)
    assert.ok(s.autoReply.subject.includes("{{form_title}}"))
    assert.equal(s.autoReply.includeAnswers, true)
  })

  it("keeps legacy forms sending receipts when a recipient field was chosen", () => {
    assert.equal(normalizeSettings({ respondentEmailFieldId: "f_email" }).autoReply.enabled, true)
    assert.equal(normalizeSettings({ respondentEmailFieldId: null }).autoReply.enabled, false)
    assert.equal(normalizeSettings({ respondentEmailFieldId: "f_email", autoReply: { enabled: false } }).autoReply.enabled, false)
  })

  it("clamps and sanitises stored values", () => {
    const s = normalizeSettings({ autoReply: { enabled: true, subject: "x".repeat(500), fromName: 'Acme <evil@x.com>\r\nBcc: a@b.c', body: 42 } })
    assert.equal(s.autoReply.subject.length, 200)
    assert.ok(!/[<>\r\n]/.test(s.autoReply.fromName))
    assert.equal(s.autoReply.body, defaultSettings().autoReply.body)
  })

  it("never exposes the auto-reply template to respondents", () => {
    const pub = toPublicSettings(normalizeSettings({ autoReply: { enabled: true } })) as Record<string, unknown>
    assert.equal("autoReply" in pub, false)
    assert.equal("notifyEmails" in pub, false)
  })

  it("interpolates answers and system merge tags", () => {
    const schema = { version: 1, fields: [{ id: "f1", key: "name", type: "short_text", label: "Name" }], logic: [] } as unknown as FormSchema
    assert.equal(pipe("Hi {{name}}, ref {{submission_id}} for {{form_title}}{{missing}}", schema, { f1: "Ada" }, { submission_id: "sub_1", form_title: "KYC" }), "Hi Ada, ref sub_1 for KYC")
  })
})

describe("email providers", () => {
  it("falls back to the outbox when nothing is configured", () => {
    assert.equal(activeEmailProvider({}), "log")
  })
  it("prefers Brevo, then Mailtrap, then SMTP", () => {
    assert.equal(activeEmailProvider({ BREVO_API_KEY: "xkeysib-1", MAILTRAP_API_KEY: "m", SMTP_URL: "smtp://x" }), "brevo")
    assert.equal(activeEmailProvider({ MAILTRAP_API_KEY: "m", SMTP_URL: "smtp://x" }), "mailtrap")
    assert.equal(activeEmailProvider({ SMTP_HOST: "smtp.example.com" }), "smtp")
  })
  it("honours EMAIL_PROVIDER only when that provider is configured", () => {
    assert.equal(activeEmailProvider({ EMAIL_PROVIDER: "mailtrap", BREVO_API_KEY: "b", MAILTRAP_API_KEY: "m" }), "mailtrap")
    assert.equal(activeEmailProvider({ EMAIL_PROVIDER: "smtp", BREVO_API_KEY: "b" }), "brevo")
    assert.equal(activeEmailProvider({ EMAIL_PROVIDER: "LOG", BREVO_API_KEY: "b" }), "log")
    assert.equal(activeEmailProvider({ EMAIL_PROVIDER: "resend", BREVO_API_KEY: "b" }), "brevo")
  })
  it("requires an inbox id for the Mailtrap sandbox", () => {
    assert.equal(activeEmailProvider({ MAILTRAP_API_KEY: "m", MAILTRAP_USE_SANDBOX: "true" }), "log")
    const env = { MAILTRAP_API_KEY: "m", MAILTRAP_USE_SANDBOX: "true", MAILTRAP_INBOX_ID: "3112" }
    assert.equal(activeEmailProvider(env), "mailtrap")
    assert.equal(mailtrapInboxId(env), 3112)
    assert.equal(mailtrapInboxId({ MAILTRAP_SANDBOX_ID: "77" }), 77)
    assert.equal(mailtrapInboxId({ MAILTRAP_INBOX_ID: "abc" }), undefined)
    assert.equal(providerDescription("mailtrap", env), "Mailtrap (sandbox inbox)")
  })
  it("parses sender addresses for the HTTP APIs", () => {
    assert.deepEqual(parseAddress("Digital Fueled <hi@df.dev>"), { name: "Digital Fueled", email: "hi@df.dev" })
    assert.deepEqual(parseAddress(withFromName("Ops <ops@df.dev>", "Vendor KYC")), { name: "Vendor KYC", email: "ops@df.dev" })
    assert.deepEqual(parseAddress(" a@b.co "), { email: "a@b.co" })
  })
})
