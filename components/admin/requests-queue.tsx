"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, InboxIcon, MailIcon, PhoneIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { decideUpgradeRequest } from "@/app/actions/billing"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface RequestItem {
  id: string
  status: "PENDING" | "APPROVED" | "DECLINED"
  createdAt: string
  updatedAt: string
  contactEmail: string
  contactPhone: string | null
  message: string | null
  adminResponse: string | null
  user: { id: string; name: string | null; email: string; currentPlan: string; forms: number }
  plan: { id: string; name: string; priceLabel: string }
}

type Decision = { req: RequestItem; decision: "APPROVED" | "DECLINED" }

function RequestCard({ r, onDecide }: { r: RequestItem; onDecide?: (d: Decision) => void }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          {r.user.name ?? r.user.email}
          <span className="font-normal text-muted-foreground">
            {r.user.currentPlan} → <span className="font-medium text-foreground">{r.plan.name}</span>
          </span>
          <Badge variant="outline" className="font-normal">{r.plan.priceLabel}</Badge>
        </CardTitle>
        <CardDescription className="text-xs" title={formatDateTime(r.createdAt)}>
          {r.user.email} · {r.user.forms} forms · requested {timeAgo(r.createdAt)}
        </CardDescription>
        <CardAction className="flex gap-2">
          {r.status === "PENDING" && onDecide ? (
            <>
              <Button size="sm" variant="outline" onClick={() => onDecide({ req: r, decision: "DECLINED" })}>
                <XIcon /> Decline
              </Button>
              <Button size="sm" onClick={() => onDecide({ req: r, decision: "APPROVED" })}>
                <CheckIcon /> Approve
              </Button>
            </>
          ) : (
            <Badge
              variant="outline"
              className={cn(
                r.status === "APPROVED" && "border-primary/30 bg-accent text-accent-foreground",
                r.status === "DECLINED" && "border-destructive/30 text-destructive"
              )}
            >
              {r.status === "APPROVED" ? "Approved" : "Declined"} · {timeAgo(r.updatedAt)}
            </Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2 px-4">
        <div className="flex flex-wrap gap-3 text-sm">
          <a href={`mailto:${r.contactEmail}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <MailIcon className="size-3.5" /> {r.contactEmail}
          </a>
          {r.contactPhone && (
            <a href={`tel:${r.contactPhone.replace(/[^+0-9]/g, "")}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <PhoneIcon className="size-3.5" /> {r.contactPhone}
            </a>
          )}
        </div>
        {r.message && <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">{r.message}</p>}
        {r.adminResponse && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Response:</span> {r.adminResponse}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function RequestsQueue({ requests }: { requests: RequestItem[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [decision, setDecision] = useState<Decision | null>(null)
  const [response, setResponse] = useState("")
  const [duration, setDuration] = useState("30")

  const byStatus = (s: RequestItem["status"]) => requests.filter((r) => r.status === s)
  const openDecision = (d: Decision) => {
    setResponse(d.decision === "APPROVED" ? `Welcome to ${d.req.plan.name}! Your plan is now active.` : "")
    setDuration("30")
    setDecision(d)
  }

  const confirm = () =>
    start(async () => {
      if (!decision) return
      const res = await decideUpgradeRequest({
        requestId: decision.req.id,
        decision: decision.decision,
        adminResponse: response,
        durationDays: decision.decision === "APPROVED" ? (duration === "0" ? null : Number(duration)) : null,
      })
      if (!res.ok) {
        toast.error(res.error)
        setDecision(null)
        router.refresh()
        return
      }
      toast.success(decision.decision === "APPROVED" ? `${decision.req.plan.name} activated for ${decision.req.user.email}` : "Request declined")
      setDecision(null)
      router.refresh()
    })

  const list = (items: RequestItem[], empty: string) =>
    items.length ? (
      <div className="space-y-3">
        {items.map((r) => (
          <RequestCard key={r.id} r={r} onDecide={openDecision} />
        ))}
      </div>
    ) : (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>{empty}</EmptyTitle>
          <EmptyDescription>Upgrade requests from the billing page show up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <>
      <Tabs defaultValue="PENDING">
        <TabsList>
          <TabsTrigger value="PENDING">
            Pending
            {byStatus("PENDING").length > 0 && <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px] tabular-nums">{byStatus("PENDING").length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="DECLINED">Declined</TabsTrigger>
        </TabsList>
        <TabsContent value="PENDING" className="pt-2">
          {list(byStatus("PENDING"), "Inbox zero — no pending requests")}
        </TabsContent>
        <TabsContent value="APPROVED" className="pt-2">
          {list(byStatus("APPROVED"), "No approved requests yet")}
        </TabsContent>
        <TabsContent value="DECLINED" className="pt-2">
          {list(byStatus("DECLINED"), "No declined requests")}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <AlertDialogContent>
          {decision && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {decision.decision === "APPROVED" ? `Approve ${decision.req.plan.name}?` : "Decline this request?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {decision.decision === "APPROVED"
                    ? `${decision.req.user.email} is switched to ${decision.req.plan.name} immediately.`
                    : `${decision.req.user.email} stays on ${decision.req.user.currentPlan}. They’ll see your note on their billing page.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <FieldGroup className="gap-4">
                {decision.decision === "APPROVED" && (
                  <Field>
                    <FieldLabel>Access period</FieldLabel>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="14">14-day trial</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="365">1 year</SelectItem>
                        <SelectItem value="0">No expiry</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="admin-response">Message to the user</FieldLabel>
                  <Textarea id="admin-response" rows={3} value={response} onChange={(e) => setResponse(e.target.value)} maxLength={2000} placeholder={decision.decision === "DECLINED" ? "Let them know why, and what to do next…" : ""} />
                  <FieldDescription>Shown in their request history.</FieldDescription>
                </Field>
              </FieldGroup>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant={decision.decision === "DECLINED" ? "destructive" : "default"}
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault()
                    confirm()
                  }}
                >
                  {decision.decision === "APPROVED" ? "Approve & activate" : "Decline request"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
