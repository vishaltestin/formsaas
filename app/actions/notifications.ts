"use server"

import { z } from "zod"

import { fail, ok, type ActionResult } from "@/lib/action-result"
import { prisma } from "@/lib/prisma"
import { assertUser } from "@/lib/session"

export interface NotificationView {
  id: string
  title: string
  body: string | null
  href: string | null
  kind: string
  read: boolean
  createdAt: string
}

export async function listNotifications(): Promise<ActionResult<{ items: NotificationView[]; unread: number }>> {
  try {
    const user = await assertUser()
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ])
    return ok({
      unread,
      items: items.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, kind: n.kind, read: !!n.readAt, createdAt: n.createdAt.toISOString() })),
    })
  } catch (e) {
    return fail(e)
  }
}

export async function markNotificationsRead(ids: string[] | "all"): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await assertUser()
    const where = ids === "all" ? { userId: user.id, readAt: null } : { userId: user.id, readAt: null, id: { in: z.array(z.string().max(40)).max(100).parse(ids) } }
    const res = await prisma.notification.updateMany({ where, data: { readAt: new Date() } })
    return ok({ count: res.count })
  } catch (e) {
    return fail(e)
  }
}
