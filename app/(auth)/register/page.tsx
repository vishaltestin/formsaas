import { Suspense } from "react"
import type { Metadata } from "next"

import { AuthForm } from "@/components/app/auth-form"

export const metadata: Metadata = { title: "Create account" }

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mk-heading text-4xl">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Start on the Free plan — upgrade any time.</p>
      </div>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </div>
  )
}
