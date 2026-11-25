import { notFound } from "next/navigation"

import { FormRenderer, type EmbedSource } from "@/components/renderer/form-renderer"
import { EmbedBridge, FormStatusScreen, PasswordGate } from "@/components/renderer/public-form-client"
import { availability, normalizeSettings, normalizeTheme } from "@/lib/form-engine"
import { prisma } from "@/lib/prisma"
import { buildPublicPayload } from "@/lib/public-form"

const SOURCES: Record<string, EmbedSource> = {
  iframe: "IFRAME",
  script: "SCRIPT",
  popup: "POPUP",
  drawer: "DRAWER",
}

export async function PublicFormPage({
  slug,
  embedded,
  src,
}: {
  slug: string
  embedded: boolean
  src?: string
}) {
  const form = await prisma.form.findUnique({ where: { slug } })
  if (!form) notFound()

  const theme = normalizeTheme(form.themeConfig)
  const settings = normalizeSettings(form.settings)
  const source: EmbedSource = embedded ? (SOURCES[src ?? ""] ?? "IFRAME") : "DIRECT"
  const bridge = embedded ? <EmbedBridge slug={slug} /> : null

  if (!form.publishedSchema || form.status === "DRAFT") {
    return (
      <>
        {bridge}
        <FormStatusScreen theme={theme} formId={form.id} title={form.title} message="This form isn't published yet. Check back soon." embedded={embedded} />
      </>
    )
  }

  const total = await prisma.submission.count({ where: { formId: form.id } })
  const avail = availability(form.status, settings, total)
  if (!avail.open) {
    return (
      <>
        {bridge}
        <FormStatusScreen
          theme={theme}
          formId={form.id}
          title={avail.reason === "scheduled" ? "Not open yet" : "Form closed"}
          message={avail.message}
          embedded={embedded}
        />
      </>
    )
  }

  const payload = await buildPublicPayload(form)

  if (embedded && source !== "IFRAME" && !payload.advancedEmbeds) {
    return (
      <>
        {bridge}
        <FormStatusScreen
          theme={theme}
          formId={form.id}
          title="Embed unavailable"
          message="Script, popup and drawer embeds require the form owner to be on a Pro plan. Use the standard iframe embed or direct link instead."
          embedded
        />
      </>
    )
  }

  if (settings.passwordEnabled && settings.passwordHash) {
    return (
      <>
        {bridge}
        <PasswordGate slug={slug} formId={form.id} title={form.title} theme={theme} embedded={embedded} source={source} />
      </>
    )
  }

  return (
    <>
      {bridge}
      <FormRenderer
        formId={payload.formId}
        slug={payload.slug}
        title={payload.title}
        description={payload.description}
        mode={payload.mode}
        schema={payload.schema}
        theme={payload.theme}
        settings={payload.settings}
        logicEnabled={payload.logicEnabled}
        showBadge={payload.showBadge}
        allowCustomCss={payload.allowCustomCss}
        allowBranding={payload.allowBranding}
        maxUploadMb={payload.maxUploadMb}
        embedded={embedded}
        source={source}
      />
    </>
  )
}
