import type { CSSProperties, ReactNode } from "react"

import { cn } from "@/lib/utils"

export type Viewport = "desktop" | "tablet" | "mobile"

/** Host shown in the simulated address bar. */
export const APP_HOST = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "") || "forms.digitalfueled.app"

/** CSS pixel widths of the simulated screens (iPad portrait, iPhone 15/16). */
export const DEVICE_SCREEN = {
  desktop: { width: 1280, height: 800, label: "Desktop", detail: "1280 px and wider" },
  tablet: { width: 768, height: 1024, label: "Tablet", detail: "768 × 1024" },
  mobile: { width: 390, height: 844, label: "Mobile", detail: "390 × 844" },
} as const satisfies Record<Viewport, { width: number; height: number; label: string; detail: string }>

/**
 * A simulated device around the form: a browser window for desktop, a tablet
 * and a phone with their real screen widths. The screen is a container-query
 * root, so the form lays out exactly as it would at that width.
 *
 * `fill` makes the screen fill the available height and scroll internally
 * (the preview dialog); otherwise the screen grows with its content and
 * starts at the device's height (the editable canvas).
 */
/** Full width of the tablet / phone including the bezel. */
export function deviceOuterWidth(viewport: Viewport) {
  return viewport === "desktop" ? DEVICE_SCREEN.desktop.width : DEVICE_SCREEN[viewport].width + (viewport === "tablet" ? 14 : 10) * 2 + 2
}

export function DeviceFrame({
  viewport,
  url,
  fill = false,
  scale = 1,
  screenStyle,
  screenClassName,
  onScreenClick,
  children,
}: {
  viewport: Viewport
  url: string
  fill?: boolean
  /** Visual scale (CSS zoom) used when the device is wider than the space available. */
  scale?: number
  screenStyle?: CSSProperties
  screenClassName?: string
  onScreenClick?: () => void
  children: ReactNode
}) {
  const screen = DEVICE_SCREEN[viewport]

  if (viewport === "desktop") {
    return (
      <div
        data-device="desktop"
        className={cn("mx-auto flex w-full max-w-[1280px] flex-col overflow-hidden rounded-lg border bg-background", fill ? "h-full" : "min-h-full")}
      >
        <div className="flex h-8 shrink-0 items-center gap-3 border-b bg-muted/70 px-3" aria-hidden>
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
          </span>
          <span className="mx-auto w-full max-w-md truncate rounded-md border bg-background px-3 py-0.5 text-center font-mono text-[11px] text-muted-foreground">
            {url}
          </span>
          <span className="w-10" />
        </div>
        <div
          className={cn("@container min-h-0 flex-1", fill && "overflow-auto", screenClassName)}
          style={screenStyle}
          onClick={onScreenClick}
        >
          {children}
        </div>
      </div>
    )
  }

  const tablet = viewport === "tablet"
  const bezel = tablet ? 14 : 10
  return (
    <div
      data-device={viewport}
      className={cn(
        "mx-auto flex shrink-0 flex-col border border-foreground/15 bg-foreground/[0.07]",
        tablet ? "rounded-[2.25rem]" : "rounded-[3rem]",
        fill && "max-h-full"
      )}
      style={{ width: deviceOuterWidth(viewport), padding: bezel, height: fill ? screen.height + bezel * 2 + 30 : undefined, zoom: scale < 1 ? scale : undefined }}
    >
      <div className="flex h-5 shrink-0 items-center justify-center pb-1" aria-hidden>
        {tablet ? <span className="size-1.5 rounded-full bg-foreground/25" /> : <span className="h-1.5 w-16 rounded-full bg-foreground/25" />}
      </div>
      <div
        className={cn(
          "@container min-h-0 flex-1 overflow-x-hidden border bg-background",
          tablet ? "rounded-[1.4rem]" : "rounded-[2.2rem]",
          fill && "overflow-y-auto",
          screenClassName
        )}
        style={{ minHeight: fill ? undefined : screen.height, ...screenStyle }}
        onClick={onScreenClick}
      >
        {children}
      </div>
      <div className="flex h-3 shrink-0 items-end justify-center" aria-hidden>
        {!tablet && <span className="h-1 w-24 rounded-full bg-foreground/20" />}
      </div>
    </div>
  )
}
