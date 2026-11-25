import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decryptSecret, encryptSecret, SecretError, secretHint } from "../../lib/crypto/secrets"
import { providerFormSchema, publicConfigFrom, parsePublicConfig, resolveProvider } from "../../lib/email/workspace-config"
import {
  ACCESS_LEVELS,
  canGrantLevel,
  canGrantRole,
  canManageMember,
  effectiveFormLevel,
  landingSegment,
  levelAllows,
  permissionsFor,
  roleCan,
  WORKSPACE_ROLES,
  type AccessLevel,
  type WorkspaceRole,
} from "../../lib/rbac/policy"
import { isPrivateAddress, isValidHostname, resolvePublicHost, UnsafeHostError } from "../../lib/security/network"
import { safeCallbackUrl } from "../../lib/security/redirect"

describe("workspace roles", () => {
  it("is a strict hierarchy for every capability", () => {
    const caps = ["workspace.view", "members.view", "form.create", "forms.all", "members.invite", "members.manage", "groups.manage", "email.manage", "audit.view", "workspace.rename", "workspace.delete", "ownership.transfer"] as const
    const rank: Record<WorkspaceRole, number> = { MEMBER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 }
    for (const cap of caps)
      for (const a of WORKSPACE_ROLES)
        for (const b of WORKSPACE_ROLES) if (rank[a] >= rank[b] && roleCan(b, cap)) assert.ok(roleCan(a, cap), `${a} should have ${cap} because ${b} does`)
  })

  it("keeps the matrix the product promises", () => {
    assert.equal(roleCan("MEMBER", "form.create"), false)
    assert.equal(roleCan("EDITOR", "form.create"), true)
    assert.equal(roleCan("EDITOR", "forms.all"), false)
    assert.equal(roleCan("ADMIN", "forms.all"), true)
    assert.equal(roleCan("ADMIN", "email.manage"), true)
    assert.equal(roleCan("EDITOR", "email.manage"), false)
    assert.equal(roleCan("ADMIN", "workspace.delete"), false)
    assert.equal(roleCan("ADMIN", "ownership.transfer"), false)
    assert.equal(roleCan("OWNER", "ownership.transfer"), true)
  })

  it("denies everything to non-members and unknown roles", () => {
    assert.equal(roleCan(null, "workspace.view"), false)
    assert.equal(roleCan(undefined, "workspace.view"), false)
    assert.equal(roleCan("SUPERUSER" as WorkspaceRole, "workspace.view"), false)
  })
})

describe("effective form level", () => {
  const base = { isCreator: false, direct: [] as AccessLevel[], groups: [] as AccessLevel[] }

  it("gives nothing to non-members, even with stale grants", () => {
    assert.equal(effectiveFormLevel({ ...base, role: null, direct: ["MANAGE"], groups: ["MANAGE"] }), null)
  })
  it("gives owners and admins Manage on every form", () => {
    assert.equal(effectiveFormLevel({ ...base, role: "OWNER" }), "MANAGE")
    assert.equal(effectiveFormLevel({ ...base, role: "ADMIN" }), "MANAGE")
  })
  it("gives editors Manage only on forms they created", () => {
    assert.equal(effectiveFormLevel({ ...base, role: "EDITOR", isCreator: true }), "MANAGE")
    assert.equal(effectiveFormLevel({ ...base, role: "EDITOR" }), null)
  })
  it("does not give members creator rights", () => {
    assert.equal(effectiveFormLevel({ ...base, role: "MEMBER", isCreator: true }), null)
  })
  it("takes the highest of direct and group grants", () => {
    assert.equal(effectiveFormLevel({ ...base, role: "MEMBER", direct: ["VIEW"], groups: ["REVIEW"] }), "REVIEW")
    assert.equal(effectiveFormLevel({ ...base, role: "EDITOR", direct: ["EDIT"], groups: ["VIEW"] }), "EDIT")
  })
  it("ignores garbage levels", () => {
    assert.equal(effectiveFormLevel({ ...base, role: "MEMBER", direct: ["ROOT" as AccessLevel] }), null)
  })
})

describe("form permissions", () => {
  it("maps levels to permissions monotonically", () => {
    for (let i = 0; i < ACCESS_LEVELS.length; i++)
      for (let j = i; j < ACCESS_LEVELS.length; j++) {
        const lo = permissionsFor(ACCESS_LEVELS[i])
        const hi = permissionsFor(ACCESS_LEVELS[j])
        for (const [p, v] of Object.entries(lo)) if (v) assert.ok(hi[p as keyof typeof hi], `${ACCESS_LEVELS[j]} should include ${p}`)
      }
  })
  it("separates reading, reviewing, editing and managing", () => {
    assert.equal(levelAllows("VIEW", "form.view"), true)
    assert.equal(levelAllows("VIEW", "submissions.review"), false)
    assert.equal(levelAllows("REVIEW", "submissions.review"), true)
    assert.equal(levelAllows("REVIEW", "submissions.delete"), false)
    assert.equal(levelAllows("REVIEW", "form.edit"), false)
    assert.equal(levelAllows("EDIT", "form.publish"), true)
    assert.equal(levelAllows("EDIT", "form.delete"), false)
    assert.equal(levelAllows("EDIT", "form.access"), false)
    assert.equal(levelAllows("MANAGE", "form.access"), true)
    assert.equal(levelAllows(null, "form.view"), false)
  })
  it("lands reviewers on responses and editors on the builder", () => {
    assert.equal(landingSegment("VIEW"), "submissions")
    assert.equal(landingSegment("REVIEW"), "submissions")
    assert.equal(landingSegment("EDIT"), "edit")
  })
})

describe("escalation guards", () => {
  it("never lets anyone change or remove the owner", () => {
    for (const a of WORKSPACE_ROLES) assert.equal(canManageMember(a, "OWNER").ok, false)
  })
  it("blocks self role changes", () => {
    assert.equal(canManageMember("ADMIN", "MEMBER", { self: true }).ok, false)
    assert.equal(canManageMember("OWNER", "ADMIN", { self: true }).ok, false)
  })
  it("lets admins act only below themselves", () => {
    assert.equal(canManageMember("ADMIN", "ADMIN").ok, false)
    assert.equal(canManageMember("ADMIN", "EDITOR").ok, true)
    assert.equal(canManageMember("OWNER", "ADMIN").ok, true)
    assert.equal(canManageMember("EDITOR", "MEMBER").ok, false)
    assert.equal(canManageMember("MEMBER", "MEMBER").ok, false)
  })
  it("never grants OWNER and keeps admins from minting admins", () => {
    for (const a of WORKSPACE_ROLES) assert.equal(canGrantRole(a, "OWNER").ok, false)
    assert.equal(canGrantRole("ADMIN", "ADMIN").ok, false)
    assert.equal(canGrantRole("ADMIN", "EDITOR").ok, true)
    assert.equal(canGrantRole("OWNER", "ADMIN").ok, true)
    assert.equal(canGrantRole("EDITOR", "MEMBER").ok, false)
  })
  it("caps form grants at the granter's own level and requires Manage", () => {
    assert.equal(canGrantLevel("MANAGE", "MANAGE").ok, true)
    assert.equal(canGrantLevel("MANAGE", "VIEW").ok, true)
    assert.equal(canGrantLevel("EDIT", "VIEW").ok, false)
    assert.equal(canGrantLevel(null, "VIEW").ok, false)
  })
})

describe("credential encryption", () => {
  const env = { EMAIL_CREDENTIALS_KEY: "unit-test-key-with-enough-entropy" }

  it("round-trips and never stores plaintext", () => {
    const token = encryptSecret("xkeysib-super-secret-1234", "wsp_a", env)
    assert.ok(token.startsWith("v1."))
    assert.ok(!token.includes("super-secret"))
    assert.equal(decryptSecret(token, "wsp_a", env), "xkeysib-super-secret-1234")
  })
  it("uses a fresh IV every time", () => {
    assert.notEqual(encryptSecret("same", "wsp_a", env), encryptSecret("same", "wsp_a", env))
  })
  it("refuses a ciphertext moved to another workspace (AAD)", () => {
    const token = encryptSecret("secret", "wsp_a", env)
    assert.throws(() => decryptSecret(token, "wsp_b", env), SecretError)
  })
  it("detects tampering", () => {
    const [v, iv, tag, ct] = encryptSecret("secret-value", "wsp_a", env).split(".")
    const flipped = Buffer.from(ct, "base64url")
    flipped[0] ^= 1
    assert.throws(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join("."), "wsp_a", env), SecretError)
    assert.throws(() => decryptSecret("not-a-token", "wsp_a", env), SecretError)
  })
  it("fails with a different key", () => {
    const token = encryptSecret("secret", "wsp_a", env)
    assert.throws(() => decryptSecret(token, "wsp_a", { EMAIL_CREDENTIALS_KEY: "another-key-also-long-enough" }), SecretError)
  })
  it("requires a strong key and a context", () => {
    assert.throws(() => encryptSecret("x", "wsp_a", { AUTH_SECRET: "short" }), SecretError)
    assert.throws(() => encryptSecret("x", "", env), SecretError)
  })
  it("hints only the last four characters of long secrets", () => {
    assert.equal(secretHint("xkeysib-abcdefgh1234"), "1234")
    assert.equal(secretHint("short"), null)
  })
})

describe("network guard", () => {
  it("classifies private and public addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"])
      assert.equal(isPrivateAddress(ip), true, ip)
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) assert.equal(isPrivateAddress(ip), false, ip)
  })
  it("validates hostnames", () => {
    assert.equal(isValidHostname("smtp-relay.brevo.com"), true)
    assert.equal(isValidHostname("-bad.example.com"), false)
    assert.equal(isValidHostname("evil.com/path"), false)
    assert.equal(isValidHostname("a b.com"), false)
  })
  it("refuses internal targets unless explicitly allowed", async () => {
    await assert.rejects(resolvePublicHost("127.0.0.1", false), UnsafeHostError)
    await assert.rejects(resolvePublicHost("169.254.169.254", false), UnsafeHostError)
    await assert.rejects(resolvePublicHost("mail.internal", false), UnsafeHostError)
    await assert.rejects(resolvePublicHost("localhost", false), UnsafeHostError)
    assert.equal(await resolvePublicHost("127.0.0.1", true), "127.0.0.1")
    assert.equal(await resolvePublicHost("8.8.8.8", false), "8.8.8.8")
  })
})

describe("sign-in redirects", () => {
  it("keeps same-origin paths", () => {
    assert.equal(safeCallbackUrl("/invite/abc"), "/invite/abc")
    assert.equal(safeCallbackUrl("/dashboard/team?tab=groups"), "/dashboard/team?tab=groups")
  })
  it("rejects off-site and malformed targets", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "/ok\u0000", "", null, undefined])
      assert.equal(safeCallbackUrl(bad as string), "/dashboard", String(bad))
  })
})

describe("workspace provider settings", () => {
  const base = { provider: "SMTP" as const, enabled: true, fromEmail: "Forms@Acme.com", host: "smtp.acme.com", port: 587 }
  it("validates SMTP ports and hosts", () => {
    assert.equal(providerFormSchema.safeParse(base).success, true)
    assert.equal(providerFormSchema.safeParse({ ...base, port: 22 }).success, false)
    assert.equal(providerFormSchema.safeParse({ ...base, host: "" }).success, false)
  })
  it("needs an inbox id for the Mailtrap sandbox", () => {
    assert.equal(providerFormSchema.safeParse({ provider: "MAILTRAP", enabled: true, fromEmail: "a@b.co", sandbox: true }).success, false)
    assert.equal(providerFormSchema.safeParse({ provider: "MAILTRAP", enabled: true, fromEmail: "a@b.co", sandbox: true, inboxId: "42" }).success, true)
  })
  it("rejects header injection in the from name", () => {
    assert.equal(providerFormSchema.safeParse({ ...base, fromName: "Acme\r\nBcc: x@y.z" }).success, false)
  })
  it("persists only non-secret config and resolves with the secret", () => {
    const parsed = providerFormSchema.parse({ ...base, port: 465, username: "u", password: "pw" })
    const cfg = publicConfigFrom(parsed)
    assert.deepEqual(cfg, { kind: "SMTP", host: "smtp.acme.com", port: 465, secure: true, username: "u" })
    assert.ok(!JSON.stringify(cfg).includes("pw"))
    assert.deepEqual(parsePublicConfig("SMTP", cfg), cfg)
    assert.deepEqual(resolveProvider(cfg, "pw"), { kind: "smtp", host: "smtp.acme.com", port: 465, secure: true, username: "u", password: "pw" })
  })
})
