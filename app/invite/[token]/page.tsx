import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"

import { Logo } from "@/components/app/logo"
import { AcceptInvite } from "@/components/team/accept-invite"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/format"
import { prisma } from "@/lib/prisma"
import { clientIp, rateLimit } from "@/lib/public-form"
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/rbac/policy"
import { getSessionUser } from "@/lib/session"
import { sha256 } from "@/lib/signing"

export const metadata: Metadata = { title: { absolute: "Workspace invitation · Digital Fueled" }, robots: { index: false } }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-svh bg-muted/30 px-4 py-12">
      <div className="mx-auto w-full max-w-md space-y-6">
        <Logo />
        <section className="rounded-lg border bg-background p-6">{children}</section>
      </div>
    </main>
  )
}

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <Button asChild variant="outline" className="mt-5">
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </Shell>
  )
}

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params
  const ip = clientIp(await headers())
  if (!(await rateLimit(`invite-view:${ip}`, 30, 10 * 60_000))) return <Problem title="Slow down" body="Too many invitation lookups from your network. Try again in a few minutes." />
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return <Problem title="Invitation not found" body="Check that you copied the whole link." />

  const invite = await prisma.workspaceInvite.findUnique({
    where: { tokenHash: sha256(token) },
    include: { workspace: { select: { name: true } }, invitedBy: { select: { name: true, email: true } } },
  })
  if (!invite || invite.revokedAt) return <Problem title="Invitation not found" body="This link is invalid or has been revoked. Ask the person who invited you for a new one." />
  if (invite.acceptedAt) return <Problem title="Already accepted" body="This invitation has been used. If it was you, the workspace is in your switcher." />
  if (invite.expiresAt < new Date()) return <Problem title="Invitation expired" body={`This invitation expired on ${formatDate(invite.expiresAt)}. Ask for a new one.`} />

  const user = await getSessionUser()
  const dbUser = user ? await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } }) : null
  const back = encodeURIComponent(`/invite/${token}`)
  const inviter = invite.invitedBy ? invite.invitedBy.name || invite.invitedBy.email : "A teammate"
  const matches = !!dbUser && dbUser.email.toLowerCase() === invite.email.toLowerCase()

  return (
    <Shell>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Workspace invitation</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">Join {invite.workspace.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {inviter} invited <span className="font-medium text-foreground">{invite.email}</span> to join as{" "}
        <span className="font-medium text-foreground">{ROLE_LABELS[invite.role]}</span>.
      </p>
      <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm">{ROLE_DESCRIPTIONS[invite.role]}</p>
      <div className="mt-6">
        {!dbUser ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="flex-1">
              <Link href={`/login?callbackUrl=${back}`}>Sign in to accept</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href={`/register?callbackUrl=${back}`}>Create an account</Link>
            </Button>
          </div>
        ) : matches ? (
          <AcceptInvite token={token} workspaceName={invite.workspace.name} />
        ) : (
          <p className="text-sm">
            You&rsquo;re signed in as <span className="font-medium">{dbUser.email}</span>. This invitation is for <span className="font-medium">{invite.email}</span> — sign out and sign in with that address to accept it.
          </p>
        )}
      </div>
      <p className="mt-5 text-xs text-muted-foreground">Expires {formatDate(invite.expiresAt)} · single use</p>
    </Shell>
  )
}
