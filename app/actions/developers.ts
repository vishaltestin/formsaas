"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { API_SCOPES, generateApiKey } from "@/lib/api/keys"
import { prisma } from "@/lib/prisma"
import { getWorkspaceContext } from "@/lib/rbac/server"
import { assertUser } from "@/lib/session"

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  scopes: z.array(z.enum(API_SCOPES)).min(1, "Choose at least one scope"),
  expiresInDays: z.number().int().min(1).max(365).nullable(),
  rateLimit: z.number().int().min(10).max(1000),
})

/** Creates a key. The raw secret is returned exactly once; only prefix + SHA-256 hash are stored. */
export async function createApiKey(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string; raw: string; prefix: string }>> {
  try {
    const user = await assertUser()
    const parsed = createSchema.parse(input)
    const active = await prisma.apiKey.count({ where: { userId: user.id, revokedAt: null } })
    if (active >= 20) throw new Error("You can have at most 20 active API keys. Revoke one first.")
    // Keys are bound to the active workspace and act with the creator's live permissions there.
    const { active: workspace } = await getWorkspaceContext(user.id)
    const { raw, prefix, hash } = generateApiKey()
    const key = await prisma.apiKey.create({
      data: {
        userId: user.id,
        workspaceId: workspace.workspaceId,
        name: parsed.name,
        prefix,
        hash,
        scopes: Array.from(new Set(parsed.scopes)),
        rateLimit: parsed.rateLimit,
        expiresAt: parsed.expiresInDays ? new Date(Date.now() + parsed.expiresInDays * 86400000) : null,
      },
    })
    revalidatePath("/dashboard/developers")
    return ok({ id: key.id, raw, prefix })
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" }
    return fail(e)
  }
}

export async function revokeApiKey(keyId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertUser()
    const res = await prisma.apiKey.updateMany({ where: { id: z.string().max(40).parse(keyId), userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    if (res.count === 0) throw new Error("Key not found or already revoked.")
    revalidatePath("/dashboard/developers")
    return ok({ id: keyId })
  } catch (e) {
    return fail(e)
  }
}

export async function deleteApiKey(keyId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertUser()
    const key = await prisma.apiKey.findFirst({ where: { id: z.string().max(40).parse(keyId), userId: user.id } })
    if (!key) throw new Error("Key not found.")
    if (!key.revokedAt) throw new Error("Revoke the key before deleting it.")
    await prisma.apiKey.delete({ where: { id: key.id } })
    revalidatePath("/dashboard/developers")
    return ok({ id: key.id })
  } catch (e) {
    return fail(e)
  }
}
