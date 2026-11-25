import Link from "next/link"
import { redirect } from "next/navigation"

import { Logo } from "@/components/app/logo"
import { getSessionUser } from "@/lib/session"

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (user) redirect("/dashboard")
  return (
    <div className="marketing grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col p-6 md:p-10">
        <Link href="/" className="w-fit">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Digital Fueled</p>
      </div>
      <div className="relative hidden border-l bg-warm-soft/60 lg:block">
        <div className="relative flex h-full flex-col justify-center gap-10 p-16">
          <div className="max-w-md">
            <p className="mk-eyebrow text-primary">Digital Fueled · Forms, workflows &amp; API</p>
            <h2 className="mk-heading mt-5 text-5xl text-balance">
              Forms that <em className="text-primary">think</em> before they ask.
            </h2>
          </div>
          <div className="max-w-md rounded-md border bg-card p-6">
            <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>Step 2 of 4 · Your team</span>
              <span className="font-mono">50%</span>
            </div>
            <div className="mb-6 h-1 rounded-full bg-muted">
              <div className="h-1 w-1/2 rounded-full bg-primary" />
            </div>
            <p className="mb-3 text-sm font-medium">How big is your team?</p>
            <div className="grid gap-2">
              {["1–10", "11–50", "51–200", "200+"].map((o, i) => (
                <div key={o} className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${i === 2 ? "border-primary bg-primary/5" : ""}`}>
                  <span className="grid size-5 place-items-center rounded border text-[10px] font-semibold text-muted-foreground">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {o}
                </div>
              ))}
            </div>
          </div>
          <div className="max-w-md border-t border-foreground/20 pt-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Visual branching, four presentation modes, embeds anywhere and analytics that show exactly where respondents drop off.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
