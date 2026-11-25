"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { encryptSecret, secretHint } from "@/lib/crypto/secrets"
import { WORKSPACE_PROVIDER_LABELS, providerFormSchema, publicConfigFrom, secretRequired, type ProviderFormValues } from "@/lib/email/workspace-config"
import { sendEmail } from "@/lib/notify"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/public-form"
import { assertWorkspacePermission, audit } from "@/lib/rbac/server"
import { isValidHostname } from "@/lib/security/network"

const id = z.string().min(1).max(64)

function revalidate() {
  revalidatePath("/dashboard/settings")
}

/**
 * Saves the workspace's own email provider (Owner/Admin). Secrets are
 * encrypted with AES-256-GCM bound to the workspace id; leaving the secret
 * field empty keeps the stored one (only when the provider type is unchanged).
 */
export async function saveEmailProvider(workspaceId: string, input: ProviderFormValues): Promise<ActionResult<{ hint: string | null }>> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "email.manage")
    const data = providerFormSchema.parse(input)
    if (data.provider === "SMTP" && !isValidHostname(data.host)) throw new Error("Enter a valid SMTP hostname.")
    const existing = await prisma.workspaceEmailProvider.findUnique({ where: { workspaceId: membership.workspaceId } })
    const sameKind = existing?.provider === data.provider
    const newSecret = data.provider === "SMTP" ? data.password : data.apiKey

    let secretCiphertext: string
    let hint: string | null
    if (newSecret) {
      secretCiphertext = encryptSecret(newSecret, membership.workspaceId)
      hint = secretHint(newSecret)
    } else if (existing && sameKind) {
      secretCiphertext = existing.secretCiphertext
      hint = existing.secretHint
    } else if (!secretRequired(data.provider)) {
      secretCiphertext = encryptSecret("", membership.workspaceId)
      hint = null
    } else {
      throw new Error(`Enter the ${WORKSPACE_PROVIDER_LABELS[data.provider]} API key.`)
    }

    const record = {
      provider: data.provider,
      enabled: data.enabled,
      fromEmail: data.fromEmail,
      fromName: data.fromName || null,
      replyTo: data.replyTo || null,
      config: publicConfigFrom(data) as object,
      secretCiphertext,
      secretHint: hint,
      updatedById: user.id,
      // Any change invalidates the previous test result.
      lastTestAt: null,
      lastTestOk: null,
      lastError: null,
    }
    await prisma.workspaceEmailProvider.upsert({
      where: { workspaceId: membership.workspaceId },
      create: { workspaceId: membership.workspaceId, ...record },
      update: record,
    })
    await audit({
      workspaceId: membership.workspaceId,
      actorId: user.id,
      action: existing ? "email_provider.updated" : "email_provider.created",
      summary: `${existing ? "Updated" : "Connected"} ${WORKSPACE_PROVIDER_LABELS[data.provider]} for outgoing email (${data.enabled ? "on" : "off"})${newSecret ? ", credentials replaced" : ""}`,
      targetType: "email_provider",
      metadata: { provider: data.provider, fromEmail: data.fromEmail, enabled: data.enabled, secretChanged: !!newSecret },
    })
    revalidate()
    return ok({ hint })
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid settings" }
    return fail(e)
  }
}

export async function removeEmailProvider(workspaceId: string): Promise<ActionResult> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "email.manage")
    const res = await prisma.workspaceEmailProvider.deleteMany({ where: { workspaceId: membership.workspaceId } })
    if (res.count === 0) throw new Error("No email provider is connected.")
    await audit({ workspaceId: membership.workspaceId, actorId: user.id, action: "email_provider.removed", summary: "Disconnected the workspace email provider; mail falls back to the platform sender", targetType: "email_provider" })
    revalidate()
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}

/** Sends a real message through the saved provider to the signed-in admin and records the outcome. */
export async function sendProviderTest(workspaceId: string): Promise<ActionResult<{ sent: boolean; to: string; error: string | null }>> {
  try {
    const { user, membership } = await assertWorkspacePermission(id.parse(workspaceId), "email.manage")
    if (!(await rateLimit(`email-test:${membership.workspaceId}`, 10, 10 * 60_000))) throw new Error("Too many test emails. Wait a few minutes.")
    const row = await prisma.workspaceEmailProvider.findUnique({ where: { workspaceId: membership.workspaceId } })
    if (!row) throw new Error("Save a provider first.")
    if (!row.enabled) throw new Error("Turn the provider on before testing it.")
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } })
    const res = await sendEmail({
      to: [dbUser.email],
      subject: `Test from ${membership.workspaceName} via ${WORKSPACE_PROVIDER_LABELS[row.provider]}`,
      html: `<p>This test confirms <strong>${WORKSPACE_PROVIDER_LABELS[row.provider]}</strong> is delivering mail for this workspace from <strong>${row.fromEmail}</strong>.</p><p style="color:#666">Thank-you emails, notifications, approvals and invitations for this workspace now use this provider.</p>`,
      text: `This test confirms ${WORKSPACE_PROVIDER_LABELS[row.provider]} is delivering mail for this workspace from ${row.fromEmail}.`,
      source: `test:email-provider:${membership.workspaceId}`,
      workspaceId: membership.workspaceId,
    })
    await prisma.workspaceEmailProvider.update({
      where: { workspaceId: membership.workspaceId },
      data: { lastTestAt: new Date(), lastTestOk: res.sent, lastError: res.sent ? null : (res.error ?? res.reason).slice(0, 1000) },
    })
    revalidate()
    return ok({ sent: res.sent, to: dbUser.email, error: res.sent ? null : (res.error ?? res.reason) })
  } catch (e) {
    return fail(e)
  }
}
