import type { Metadata } from "next"

import { AppearanceEditor } from "@/components/admin/appearance-editor"
import { PageHeader } from "@/components/app/page-header"
import { getInterfaceFont } from "@/lib/appearance"
import { requireAdmin } from "@/lib/session"

export const metadata: Metadata = { title: "Appearance" }

export default async function AdminAppearancePage() {
  await requireAdmin()
  const font = await getInterfaceFont()
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-6">
      <PageHeader title="Appearance" description="Workspace-wide display preferences for the app and admin console." />
      <AppearanceEditor current={font} />
    </div>
  )
}
