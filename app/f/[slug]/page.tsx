import type { Metadata } from "next"

import { PublicFormPage } from "@/components/renderer/public-form-page"
import { prisma } from "@/lib/prisma"

export async function generateMetadata(props: PageProps<"/f/[slug]">): Promise<Metadata> {
  const { slug } = await props.params
  const form = await prisma.form.findUnique({ where: { slug }, select: { title: true, description: true } })
  return {
    title: { absolute: form?.title ?? "Form" },
    description: form?.description ?? undefined,
    robots: { index: false },
  }
}

export default async function HostedFormPage(props: PageProps<"/f/[slug]">) {
  const { slug } = await props.params
  return <PublicFormPage slug={slug} embedded={false} />
}
