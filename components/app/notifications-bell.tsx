"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BellIcon, CheckCheckIcon, UserCheckIcon, WorkflowIcon } from "lucide-react"

import { listNotifications, markNotificationsRead, type NotificationView } from "@/app/actions/notifications"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

function ago(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "now"
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

export function NotificationsBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationView[] | null>(null)
  const [unread, setUnread] = useState(initialUnread)
  const [loading, startLoad] = useTransition()

  const load = () =>
    startLoad(async () => {
      const res = await listNotifications()
      if (res.ok) {
        setItems(res.data.items)
        setUnread(res.data.unread)
      }
    })

  const openItem = (n: NotificationView) =>
    startLoad(async () => {
      if (!n.read) {
        await markNotificationsRead([n.id])
        setUnread((u) => Math.max(0, u - 1))
      }
      setOpen(false)
      if (n.href) router.push(n.href)
    })

  const markAll = () =>
    startLoad(async () => {
      await markNotificationsRead("all")
      setUnread(0)
      setItems((xs) => xs?.map((x) => ({ ...x, read: true })) ?? null)
    })

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) load()
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={unread ? `${unread} unread notifications` : "Notifications"}>
          <BellIcon />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 font-mono text-[9px] text-background tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <Button variant="ghost" size="xs" onClick={markAll} disabled={unread === 0 || loading}>
            <CheckCheckIcon data-icon="inline-start" /> Mark all read
          </Button>
        </div>
        <ScrollArea className="max-h-96">
          {items === null ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const Icon = n.kind === "approval" ? UserCheckIcon : n.kind === "automation" ? WorkflowIcon : BellIcon
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => openItem(n)} className="flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50">
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm", !n.read && "font-medium")}>{n.title}</span>
                        {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{ago(n.createdAt)}</span>
                        {!n.read && <span className="size-1.5 rounded-full bg-foreground" aria-label="Unread" />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
