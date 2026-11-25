import "server-only"

import { decryptSecret } from "@/lib/crypto/secrets"
import { parsePublicConfig, resolveProvider, type ResolvedProvider } from "@/lib/email/workspace-config"
import { prisma } from "@/lib/prisma"

export type WorkspaceRoute =
  | { ok: true; provider: ResolvedProvider; from: string; replyTo: string | null; label: string }
  | { ok: false; error: string; label: string }

function fromHeader(email: string, name: string | null) {
  const clean = name?.replace(/[<>"\r\n]/g, "").trim()
  return clean ? `"${clean}" <${email}>` : email
}

/**
 * The workspace's own provider, decrypted in memory for one send. Returns null
 * when the workspace has none (or it's switched off) → platform delivery.
 */
export async function loadWorkspaceRoute(workspaceId: string): Promise<WorkspaceRoute | null> {
  const row = await prisma.workspaceEmailProvider.findUnique({ where: { workspaceId } })
  if (!row || !row.enabled) return null
  const label = row.provider.toLowerCase()
  try {
    const secret = decryptSecret(row.secretCiphertext, row.workspaceId)
    return {
      ok: true,
      provider: resolveProvider(parsePublicConfig(row.provider, row.config), secret),
      from: fromHeader(row.fromEmail, row.fromName),
      replyTo: row.replyTo,
      label,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Credentials unavailable", label }
  }
}
