import type { Metadata } from "next"
import localFont from "next/font/local"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/*
 * Fonts are self-hosted from app/fonts (latin subsets, SIL OFL) instead of
 * next/font/google, so `next build` never downloads anything. That keeps
 * builds working on servers without (or with restricted) internet access,
 * with webpack and Turbopack alike.
 */
const fontSans = localFont({
  src: [
    {
      path: "./fonts/ibm-plex-sans-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-sans-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-sans-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-sans-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
})
// Same face under a stable name so the admin "Interface font" setting can switch back to it.
const fontPlexUi = localFont({
  src: [
    {
      path: "./fonts/ibm-plex-sans-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-sans-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-sans-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-sans-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-ui-plex",
  display: "swap",
  preload: false,
})
// Alternates for the admin "Interface font" setting; not preloaded, fetched only when selected.
const fontInterUi = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-ui-inter",
  display: "swap",
  preload: false,
})
const fontGeistUi = localFont({
  src: "./fonts/geist-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-ui-geist",
  display: "swap",
  preload: false,
})

const fontMono = localFont({
  src: [
    {
      path: "./fonts/ibm-plex-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-mono-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
})

/**
 * Marketing & auth typography: Funnel Display (NORD ID's variable grotesk
 * with ink-trap detailing) for headlines and its text cut, Funnel Sans, for
 * running copy. Scoped by `.marketing`.
 */
const fontDisplay = localFont({
  src: "./fonts/funnel-display-latin-wght-normal.woff2",
  weight: "300 800",
  variable: "--font-display",
  display: "swap",
})
const fontMarketing = localFont({
  src: [
    {
      path: "./fonts/funnel-sans-latin-wght-normal.woff2",
      weight: "300 800",
      style: "normal",
    },
    {
      path: "./fonts/funnel-sans-latin-wght-italic.woff2",
      weight: "300 800",
      style: "italic",
    },
  ],
  variable: "--font-marketing",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "Digital Fueled · Forms, workflows and API",
    template: "%s · Digital Fueled",
  },
  description:
    "Digital Fueled is the enterprise form platform: validated multi-step forms, approval workflows, a scoped REST API and analytics in one workspace.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        fontDisplay.variable,
        fontMarketing.variable,
        fontPlexUi.variable,
        fontInterUi.variable,
        fontGeistUi.variable,
        "font-sans",
        fontSans.variable
      )}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
