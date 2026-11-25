"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import type { z } from "zod"

import { loginAction, registerAction } from "@/app/actions/auth"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { safeCallbackUrl } from "@/lib/security/redirect"
import { loginSchema, registerSchema } from "@/lib/validators/auth"

type Mode = "login" | "register"

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const callbackUrl = safeCallbackUrl(params.get("callbackUrl"))
  const carry = callbackUrl !== "/dashboard" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(mode === "login" ? (loginSchema as unknown as typeof registerSchema) : registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  })

  function onSubmit(values: z.infer<typeof registerSchema>) {
    start(async () => {
      const res = mode === "login" ? await loginAction(values) : await registerAction(values)
      if (!res.ok) {
        form.setError("root", { message: res.error })
        return
      }
      toast.success(mode === "login" ? "Welcome back" : "Account created")
      router.push(callbackUrl)
      router.refresh()
    })
  }

  function fillDemo(email: string, password: string) {
    form.setValue("email", email)
    form.setValue("password", password)
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      {form.formState.errors.root?.message && (
        <Alert variant="destructive">
          <AlertTitle>Unable to continue</AlertTitle>
          <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
        </Alert>
      )}
      <FieldGroup className="gap-4">
        {mode === "register" && (
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="name">Full name</FieldLabel>
                <Input id="name" autoComplete="name" placeholder="Ada Lovelace" aria-invalid={fieldState.invalid} {...field} />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" aria-invalid={fieldState.invalid} {...field} />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="••••••••"
                aria-invalid={fieldState.invalid}
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending && <Spinner />}
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>
      {mode === "login" ? (
        <>
          <div className="rounded-lg border bg-muted/40 p-3 text-xs">
            <p className="mb-2 font-medium text-foreground">Demo accounts</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="xs" onClick={() => fillDemo("demo@formstudio.dev", "Demo@12345")}>
                demo@formstudio.dev
              </Button>
              <Button type="button" variant="outline" size="xs" onClick={() => fillDemo("admin@formstudio.dev", "Admin@12345")}>
                admin@formstudio.dev
              </Button>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href={`/register${carry}`} className="font-medium text-foreground underline-offset-4 hover:underline">
              Create one
            </Link>
          </p>
        </>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={`/login${carry}`} className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      )}
    </form>
  )
}
