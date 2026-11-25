import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MERGE_TAGS, safeAssetName, sniffImageType, TEMPLATE_STARTERS } from "../../lib/email/template-library"
import { defaultSettings, normalizeSettings, toPublicSettings } from "../../lib/form-engine"
import { roleCan } from "../../lib/rbac/policy"

describe("email template settings", () => {
  it("defaults to the built-in design", () => {
    const s = defaultSettings()
    assert.equal(s.autoReply.templateId, null)
    assert.equal(s.notifyTemplateId, null)
  })

  it("keeps valid template ids and drops junk", () => {
    const s = normalizeSettings({ autoReply: { templateId: "cmabc12345xyz" }, notifyTemplateId: "cmdef67890uvw" })
    assert.equal(s.autoReply.templateId, "cmabc12345xyz")
    assert.equal(s.notifyTemplateId, "cmdef67890uvw")
    for (const bad of ["", "../etc", "<script>", 42, { id: 1 }, "a".repeat(80)]) {
      const n = normalizeSettings({ autoReply: { templateId: bad }, notifyTemplateId: bad })
      assert.equal(n.autoReply.templateId, null)
      assert.equal(n.notifyTemplateId, null)
    }
  })

  it("never exposes template choices on the public form payload", () => {
    const pub = toPublicSettings(normalizeSettings({ notifyTemplateId: "cmdef67890uvw" })) as Record<string, unknown>
    assert.equal("notifyTemplateId" in pub, false)
    assert.equal("autoReply" in pub, false)
  })
})

describe("email template permissions", () => {
  it("lets Editors and above manage templates, not Members", () => {
    assert.equal(roleCan("OWNER", "templates.manage"), true)
    assert.equal(roleCan("ADMIN", "templates.manage"), true)
    assert.equal(roleCan("EDITOR", "templates.manage"), true)
    assert.equal(roleCan("MEMBER", "templates.manage"), false)
    assert.equal(roleCan(null, "templates.manage"), false)
  })
})

describe("email images", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
  it("identifies images by their bytes, not their name", () => {
    assert.equal(sniffImageType(png), "image/png")
    assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg")
    assert.equal(sniffImageType(new TextEncoder().encode("GIF89a....")), "image/gif")
    assert.equal(sniffImageType(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ")), "image/webp")
  })

  it("rejects SVG, HTML and other files", () => {
    assert.equal(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null)
    assert.equal(sniffImageType(new TextEncoder().encode("<!doctype html><script>")), null)
    assert.equal(sniffImageType(new Uint8Array()), null)
  })

  it("normalises file names and forces the real extension", () => {
    assert.equal(safeAssetName("My Logo (final).PNG", "image/png"), "my-logo-final.png")
    assert.equal(safeAssetName("evil.html", "image/jpeg"), "evil.jpg")
    assert.equal(safeAssetName("../../etc/passwd", "image/gif"), "passwd.gif")
    assert.equal(safeAssetName("....", "image/webp"), "image.webp")
  })
})

describe("starter templates", () => {
  it("ship valid starters that use documented merge tags", () => {
    const known = new Set([...MERGE_TAGS.map((t) => t.tag), "answers", "label", "value", "first_name", "else"])
    for (const s of TEMPLATE_STARTERS) {
      assert.ok(s.html.includes("<html") && s.html.includes("</html>"), `${s.id} is a full document`)
      for (const m of s.html.matchAll(/\{\{[#/]?\s*(?:if |each |unless )?([a-z_]+)/g)) assert.ok(known.has(m[1]) || m[1] === "if" || m[1] === "each", `${s.id}: unknown tag ${m[1]}`)
    }
  })
})
