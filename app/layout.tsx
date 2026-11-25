import type { Metadata } from "next"
import { Funnel_Display, Funnel_Sans, Geist, IBM_Plex_Mono, IBM_Plex_Sans, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const fontSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" })
// Same face under a stable name so the admin "Interface font" setting can switch back to it.
const fontPlexUi = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui-plex", preload: false })
// Alternates for the admin "Interface font" setting; not preloaded, fetched only when selected.
const fontInterUi = Inter({ subsets: ["latin"], variable: "--font-ui-inter", preload: false })
const fontGeistUi = Geist({ subsets: ["latin"], variable: "--font-ui-geist", preload: false })

const fontMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" })

/**
 * Marketing & auth typography: Funnel Display (NORD ID's variable grotesk
 * with ink-trap detailing) for headlines and its text cut, Funnel Sans, for
 * running copy. Scoped by `.marketing`.
 */
const fontDisplay = Funnel_Display({ subsets: ["latin"], variable: "--font-display" })
const fontMarketing = Funnel_Sans({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-marketing" })

export const metadata: Metadata = {
  title: { default: "Digital Fueled · Forms, workflows and API", template: "%s · Digital Fueled" },
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
