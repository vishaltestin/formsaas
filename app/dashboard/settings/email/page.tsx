import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { EmailProviderForm, type SavedProvider } from "@/components/team/email-provider-form"
import { SettingsNav } from "@/components/team/settings-nav"
import { defaultFrom } from "@/lib/email/providers"
import { parsePublicConfig } from "@/lib/email/workspace-config"
import { formatDateTime } from "@/lib/format"
import { prisma } from "@/lib/prisma"
import { requireWorkspace } from "@/lib/rbac/server"

export const metadata: Metadata = { title: "Email delivery" }

export default async function EmailSettingsPage() {
  const { membership } = await requireWorkspace("email.manage")
  const row = await prisma.workspaceEmailProvider.findUnique({ where: { workspaceId: membership.workspaceId } })

  // Never select the ciphertext into props: only public config + the 4-char hint reach the browser.
  let saved: SavedProvider | null = null
  if (row) {
    const cfg = parsePublicConfig(row.provider, row.config)
    saved = {
      provider: row.provider,
      enabled: row.enabled,
      fromEmail: row.fromEmail,
      fromName: row.fromName ?? "",
      replyTo: row.replyTo ?? "",
      sandbox: cfg.kind === "MAILTRAP" ? cfg.sandbox : false,
      inboxId: cfg.kind === "MAILTRAP" && cfg.inboxId ? String(cfg.inboxId) : "",
      host: cfg.kind === "SMTP" ? cfg.host : "",
      port: cfg.kind === "SMTP" ? cfg.port : 587,
      secure: cfg.kind === "SMTP" ? cfg.secure : false,
      username: cfg.kind === "SMTP" ? cfg.username : "",
      secretHint: row.secretHint,
      hasSecret: row.secretCiphertext.length > 0,
      lastTestAt: row.lastTestAt ? formatDateTime(row.lastTestAt) : null,
      lastTestOk: row.lastTestOk,
      lastError: row.lastError,
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <PageHeader title="Workspace settings" description={`Settings for ${membership.workspaceName}.`} />
      <SettingsNav active="email" role={membership.role} />
      <div>
        <h2 className="text-base font-semibold">Email delivery</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Send this workspace&rsquo;s form emails through your own Brevo, Mailtrap or SMTP account, from your own domain.</p>
      </div>
      <EmailProviderForm key={saved?.updatedAt ?? "new"} workspaceId={membership.workspaceId} saved={saved} platformSender={defaultFrom()} />
    </div>
  )
}
