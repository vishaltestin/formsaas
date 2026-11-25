import type { CSSProperties } from "react"

import { customFontFaces, googleFontsHref, sanitizeFontName, type ThemeConfig } from "@/lib/form-engine"
import { cn } from "@/lib/utils"

function luminance(hex: string) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return 1
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function themeVars(theme: ThemeConfig): CSSProperties {
  return {
    "--fs-primary": theme.colors.primary,
    "--fs-primary-text": theme.colors.primaryText,
    "--fs-bg": theme.colors.background,
    "--fs-surface": theme.colors.surface,
    "--fs-text": theme.colors.text,
    "--fs-muted": theme.colors.muted,
    "--fs-border": theme.colors.border,
    "--fs-error": theme.colors.error,
    "--fs-radius": `${theme.radius}px`,
    "--fs-font": `"${sanitizeFontName(theme.fontFamily)}"`,
    "--fs-heading-font": `"${sanitizeFontName(theme.headingFont || theme.fontFamily)}"`,
    "--fs-body-size": `${theme.bodySize}px`,
    "--fs-heading-size": `${theme.headingSize}px`,
    "--fs-max-width": `${theme.maxWidth}px`,
  } as CSSProperties
}

/** Scopes user CSS under the form root using native CSS nesting. */
export function scopedCss(scopeClass: string, css: string) {
  const safe = css.replace(/<\/?style/gi, "").replace(/</g, "\\3C ")
  return `.${scopeClass} { ${safe} }`
}

export function ThemeScope({
  theme,
  scopeId,
  allowCustomCss,
  className,
  children,
  style,
}: {
  theme: ThemeConfig
  scopeId: string
  allowCustomCss: boolean
  className?: string
  children: React.ReactNode
  style?: CSSProperties
}) {
  const href = googleFontsHref(theme)
  const faces = customFontFaces(theme)
  const scopeClass = `fs-scope-${scopeId.replace(/[^a-z0-9_-]/gi, "")}`
  return (
    <div
      className={cn("fs-root", scopeClass, className)}
      data-density={theme.density}
      data-scheme={luminance(theme.colors.background) < 0.45 ? "dark" : "light"}
      style={{ ...themeVars(theme), ...style }}
    >
      {href && <link rel="stylesheet" href={href} precedence="default" />}
      {faces && <style>{faces}</style>}
      {allowCustomCss && theme.customCss.trim() && (
        <style>{scopedCss(scopeClass, theme.customCss)}</style>
      )}
      {children}
    </div>
  )
}
