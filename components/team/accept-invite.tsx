"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { acceptInvite } from "@/app/actions/team"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function AcceptInvite({ token, workspaceName }: { token: string; workspaceName: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      className="w-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await acceptInvite(token)
          if (!res.ok) return void toast.error(res.error)
          toast.success(`Welcome to ${workspaceName}`)
          router.push("/dashboard")
          router.refresh()
        })
      }
    >
      {pending && <Spinner />} Accept and join {workspaceName}
    </Button>
  )
}
