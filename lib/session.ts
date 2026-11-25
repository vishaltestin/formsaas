import "server-only"

import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function getSessionUser() {
  const session = await auth()
  if (!session?.user?.id) return null
  return session.user
}

/** Server components / actions: require an authenticated user or redirect to /login. */
export async function requireUser() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  return user
}

/**
 * Require an ADMIN. The role is re-verified against the database so a
 * demoted admin loses access immediately even with an older JWT.
 */
export async function requireAdmin() {
  const user = await requireUser()
  const db = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  })
  if (db?.role !== "ADMIN") redirect("/dashboard")
  return user
}

/** For server actions: throws instead of redirecting. */
export async function assertUser() {
  const user = await getSessionUser()
  if (!user) throw new Error("You must be signed in.")
  return user
}

export async function assertAdmin() {
  const user = await assertUser()
  const db = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  })
  if (db?.role !== "ADMIN") throw new Error("Admin access required.")
  return user
}

// Form-level authorization lives in lib/rbac/server.ts (requireFormAccess / assertFormAccess).
