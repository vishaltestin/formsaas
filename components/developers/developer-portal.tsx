"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ExternalLinkIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { ApiKeysPanel, CopyButton, type ApiKeyRow } from "./api-keys-panel"
import { Playground, type PlaygroundForm } from "./playground"
import { RequestLogs, type RequestLogRow } from "./request-logs"
import { WebhookLogs, type DeliveryRow } from "./webhook-logs"

export interface ReferenceRow {
  method: string
  path: string
  summary: string
  scope: string | null
}

const TABS = ["keys", "playground", "logs", "webhooks", "reference"] as const

export function DeveloperPortal({
  keys,
  logs,
  deliveries,
  forms,
  reference,
  baseUrl,
  now,
}: {
  keys: ApiKeyRow[]
  logs: RequestLogRow[]
  deliveries: DeliveryRow[]
  forms: PlaygroundForm[]
  reference: ReferenceRow[]
  baseUrl: string
  now: number
}) {
  const sp = useSearchParams()
  const router = useRouter()
  const initial = sp.get("tab")
  const [tab, setTab] = useState<string>(TABS.includes(initial as (typeof TABS)[number]) ? (initial as string) : "keys")
  const [apiKey, setApiKey] = useState("")

  const changeTab = (t: string) => {
    setTab(t)
    router.replace(`/dashboard/developers?tab=${t}`, { scroll: false })
  }

  return (
    <Tabs value={tab} onValueChange={changeTab} className="gap-5">
      <TabsList>
        <TabsTrigger value="keys">
          API keys <span className="ml-1 font-mono text-[10px] text-muted-foreground tabular-nums">{keys.filter((k) => !k.revokedAt).length}</span>
        </TabsTrigger>
        <TabsTrigger value="playground">Playground</TabsTrigger>
        <TabsTrigger value="logs">
          Request logs <span className="ml-1 font-mono text-[10px] text-muted-foreground tabular-nums">{logs.length}</span>
        </TabsTrigger>
        <TabsTrigger value="webhooks">Webhook deliveries</TabsTrigger>
        <TabsTrigger value="reference">Reference</TabsTrigger>
      </TabsList>
      <TabsContent value="keys">
        <ApiKeysPanel keys={keys} now={now} onKeyCreated={setApiKey} />
      </TabsContent>
      <TabsContent value="playground">
        <Playground forms={forms} baseUrl={baseUrl} apiKey={apiKey} onApiKey={setApiKey} />
      </TabsContent>
      <TabsContent value="logs">
        <RequestLogs logs={logs} />
      </TabsContent>
      <TabsContent value="webhooks">
        <WebhookLogs deliveries={deliveries} />
      </TabsContent>
      <TabsContent value="reference" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
          <span className="text-sm text-muted-foreground">Base URL</span>
          <code className="font-mono text-xs">{baseUrl}/api/v1</code>
          <div className="ml-auto flex gap-2">
            <CopyButton value={`${baseUrl}/api/v1/openapi.json`} label="Copy spec URL" />
            <Button variant="outline" size="sm" asChild>
              <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
                openapi.json <ExternalLinkIcon data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Scope</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reference.map((r) => (
                <TableRow key={`${r.method} ${r.path}`}>
                  <TableCell
                    className={cn(
                      "font-mono text-xs",
                      r.method === "GET" ? "text-sky-700 dark:text-sky-400" : r.method === "DELETE" ? "text-destructive" : r.method === "PATCH" ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {r.method}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.path}</TableCell>
                  <TableCell className="text-sm">{r.summary}</TableCell>
                  <TableCell>
                    {r.scope ? (
                      <Badge variant="outline" className="font-mono text-[10px] font-normal">
                        {r.scope}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">any key</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="font-medium">Errors</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Always <code className="font-mono">{"{ error: { code, message, details? } }"}</code>. Validation details are keyed by field key.
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="font-medium">Rate limits</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Per key, per minute. Read <code className="font-mono">X-RateLimit-Remaining</code>; on 429 wait <code className="font-mono">Retry-After</code> seconds.
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="font-medium">Idempotency</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Send <code className="font-mono">Idempotency-Key</code> when creating submissions. Retries replay the original response for 24 hours.
            </p>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}
