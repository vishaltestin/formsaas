"use server"

import bcrypt from "bcryptjs"
import { AuthError } from "next-auth"
import { z } from "zod"

import { signIn, signOut } from "@/auth"
import { prisma } from "@/lib/prisma"
import { loginSchema, registerSchema } from "@/lib/validators/auth"

export type AuthActionResult = { ok: false; error: string } | { ok: true }

export async function loginAction(input: z.infer<typeof loginSchema>): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Enter a valid email and password." }
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    })
    return { ok: true }
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, error: "Invalid email or password." }
    throw error
  }
}

export async function registerAction(input: z.infer<typeof registerSchema>): Promise<AuthActionResult> {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." }
  const email = parsed.data.email.toLowerCase().trim()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { ok: false, error: "An account with this email already exists." }

  const freePlan = await prisma.plan.findUnique({ where: { slug: "free" } })
  await prisma.user.create({
    data: {
      email,
      name: parsed.data.name.trim(),
      password: await bcrypt.hash(parsed.data.password, 10),
      ...(freePlan ? { subscription: { create: { planId: freePlan.id, status: "ACTIVE" } } } : {}),
    },
  })
  try {
    await signIn("credentials", { email, password: parsed.data.password, redirect: false })
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, error: "Account created — please sign in." }
    throw error
  }
  return { ok: true }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" })
}
