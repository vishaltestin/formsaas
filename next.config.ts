import type { NextConfig } from "next"

/**
 * Framing policy
 * - /embed/*  : may be framed by any site (that's the point of an embed).
 * - everything else (dashboard, admin, auth, hosted forms): clickjack-protected.
 *   Set APP_FRAME_ANCESTORS (space separated origins) to allow specific parents,
 *   e.g. an internal portal or a preview environment.
 */
const extraAncestors = (process.env.APP_FRAME_ANCESTORS ?? "").trim()

const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]

const protectedHeaders = extraAncestors
  ? [...baseHeaders, { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${extraAncestors}` }]
  : [
      ...baseHeaders,
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/adapter-mariadb", "mariadb"],
  // Drafts can carry an uploaded logo, cover image and up to two custom font files.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [...baseHeaders, { key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        source: "/((?!embed/).*)",
        headers: protectedHeaders,
      },
    ]
  },
}

export default nextConfig
