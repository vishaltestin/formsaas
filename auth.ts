import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"

import { prisma } from "@/lib/prisma"

const credentialsSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
})

class InvalidLogin extends CredentialsSignin {
  code = "invalid_credentials"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // The Prisma adapter keeps Auth.js' User/Account/Session/VerificationToken
  // tables in use so OAuth/email providers can be added without migrations.
  adapter: PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email & password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) throw new InvalidLogin()
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        })
        if (!user?.password) throw new InvalidLogin()
        const ok = await bcrypt.compare(parsed.data.password, user.password)
        if (!ok) throw new InvalidLogin()
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id as string
        token.role = user.role ?? "USER"
      }
      if (trigger === "update" && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id },
          select: { role: true, name: true },
        })
        if (fresh) {
          token.role = fresh.role
          token.name = fresh.name
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id
        session.user.role = token.role ?? "USER"
      }
      return session
    },
  },
})
