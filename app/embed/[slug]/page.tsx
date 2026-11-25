import type { Metadata } from "next"

import { PublicFormPage } from "@/components/renderer/public-form-page"

export const metadata: Metadata = { robots: { index: false } }

export default async function EmbedFormPage(props: PageProps<"/embed/[slug]">) {
  const { slug } = await props.params
  const sp = await props.searchParams
  const src = typeof sp.src === "string" ? sp.src : undefined
  return (
    <div className="min-h-0 bg-transparent">
      <style>{`html,body{background:transparent!important;min-height:0!important}`}</style>
      <PublicFormPage slug={slug} embedded src={src} />
    </div>
  )
}
