import "server-only"

import { prisma } from "@/lib/prisma"

import { INTERFACE_FONTS, isInterfaceFont, type InterfaceFont } from "./appearance-shared"

export const INTERFACE_FONT_KEY = "ui.font"

export async function getInterfaceFont(): Promise<InterfaceFont> {
  const row = await prisma.systemSetting.findUnique({ where: { key: INTERFACE_FONT_KEY } })
  return row && isInterfaceFont(row.value) ? row.value : "plex"
}

/** CSS that swaps the app's sans-serif family (fonts are preloaded by next/font in the root layout). */
export function interfaceFontCss(font: InterfaceFont) {
  if (font === "plex") return ""
  return `:root:root{--font-sans:${INTERFACE_FONTS[font].stack}}`
}
