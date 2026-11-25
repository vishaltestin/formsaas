import { Suspense } from "react"
import type { Metadata } from "next"

import { AuthForm } from "@/components/app/auth-form"

export const metadata: Metadata = { title: "Sign in" }

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mk-heading text-4xl">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome back to your form studio.</p>
      </div>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  )
}
