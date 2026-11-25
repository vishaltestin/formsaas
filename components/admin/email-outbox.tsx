"use client"

import { useState } from "react"
import { MailIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export interface OutboxRow {
  id: string
  to: string[]
  subject: string
  html: string
  status: string
  provider: string | null
  messageId: string | null
  error: string | null
  source: string | null
  createdAt: string
}

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  SENT: { label: "Sent", variant: "default" },
  LOGGED: { label: "Stored", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
  QUEUED: { label: "Queued", variant: "outline" },
}

/** Older rows may still say "resend"; they render under their stored name. */
const PROVIDER_NAMES: Record<string, string> = { brevo: "Brevo", mailtrap: "Mailtrap", smtp: "SMTP" }

function kind(source: string | null) {
  const k = source?.split(":")[0]
  return k === "receipt" ? "Thank-you" : k === "notify" ? "New response" : k === "test" ? "Test" : k === "automation" ? "Workflow" : k === "billing" ? "Billing" : k === "resume" ? "Resume link" : "Other"
}

export function EmailOutboxTable({ rows }: { rows: OutboxRow[] }) {
  const [open, setOpen] = useState<OutboxRow | null>(null)
  if (rows.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailIcon />
          </EmptyMedia>
          <EmptyTitle>No emails yet</EmptyTitle>
          <EmptyDescription>Turn on a thank-you email in a form’s Settings tab, then submit the form.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead className="hidden md:table-cell">To</TableHead>
              <TableHead className="hidden lg:table-cell">Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right md:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const st = STATUS[r.status] ?? STATUS.QUEUED
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <TableCell className="max-w-72">
                    <button type="button" className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => setOpen(r)}>
                      {r.subject}
                    </button>
                    {r.error && r.status === "FAILED" && <p className="truncate text-xs text-destructive">{r.error}</p>}
                  </TableCell>
                  <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">{r.to.join(", ")}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{kind(r.source)}</TableCell>
                  <TableCell>
                    <Badge variant={st.variant}>{st.label}</Badge>
                    {r.provider && r.provider !== "log" && <span className="ml-2 text-xs text-muted-foreground">{PROVIDER_NAMES[r.provider] ?? r.provider}</span>}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                    {new Date(r.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b">
            <SheetTitle className="pr-8">{open?.subject}</SheetTitle>
            <SheetDescription>
              To {open?.to.join(", ")} · {kind(open?.source ?? null)}
              {open?.provider && open.provider !== "log" && <> · {PROVIDER_NAMES[open.provider] ?? open.provider}</>}
            </SheetDescription>
            {open?.messageId && <p className="truncate font-mono text-xs text-muted-foreground">Message ID {open.messageId}</p>}
          </SheetHeader>
          {open && <iframe title="Email preview" sandbox="" srcDoc={open.html} className="min-h-0 w-full flex-1 bg-white" />}
        </SheetContent>
      </Sheet>
    </>
  )
}
