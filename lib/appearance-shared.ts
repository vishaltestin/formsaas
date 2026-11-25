export const INTERFACE_FONTS = {
  plex: { label: "IBM Plex Sans", note: "Default. Neutral and highly legible in dense tables.", stack: "var(--font-ui-plex)" },
  inter: { label: "Inter", note: "Compact UI sans with tall x-height.", stack: "var(--font-ui-inter)" },
  geist: { label: "Geist", note: "Geometric and crisp at small sizes.", stack: "var(--font-ui-geist)" },
  system: {
    label: "System UI",
    note: "Uses the operating system font (Segoe UI, San Francisco, Roboto).",
    stack: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  },
} as const

export type InterfaceFont = keyof typeof INTERFACE_FONTS

export const INTERFACE_FONT_IDS = Object.keys(INTERFACE_FONTS) as InterfaceFont[]

export function isInterfaceFont(v: unknown): v is InterfaceFont {
  return typeof v === "string" && v in INTERFACE_FONTS
}
