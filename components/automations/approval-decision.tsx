"use client"

import { useState, useTransition } from "react"
import { CheckIcon, XIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function ApprovalDecision({ runId, nodeId, sig }: { runId: string; nodeId: string; sig: string }) {
  const [reviewer, setReviewer] = useState("")
  const [comment, setComment] = useState("")
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const decide = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const res = await fetch(`/api/automations/approvals/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node: nodeId, sig, decision, reviewer: reviewer || undefined, comment: comment || undefined }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      setResult(data.ok ? { ok: true, message: decision === "approved" ? "Approved — the automation is continuing." : "Rejected — the automation followed the rejected path." } : { ok: false, message: data.error ?? "Something went wrong." })
    })

  if (result?.ok)
    return (
      <Alert>
        <CheckIcon />
        <AlertTitle>Decision recorded</AlertTitle>
        <AlertDescription>{result.message}</AlertDescription>
      </Alert>
    )

  return (
    <div className="space-y-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="ap-reviewer">Your name or email</FieldLabel>
          <Input id="ap-reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="alex@company.com" />
        </Field>
        <Field>
          <FieldLabel htmlFor="ap-comment">Comment (optional)</FieldLabel>
          <Textarea id="ap-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
        </Field>
      </FieldGroup>
      {result && !result.ok && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t record decision</AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => decide("approved")}>
          <CheckIcon data-icon="inline-start" /> Approve
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => decide("rejected")}>
          <XIcon data-icon="inline-start" /> Reject
        </Button>
      </div>
    </div>
  )
}
