import { prisma } from "@/lib/prisma"

/**
 * Public image host for email templates. Email clients fetch these without
 * cookies, so assets are public by id (unguessable cuid). Only sniffed raster
 * images are stored. Responses are locked down with nosniff + a deny-all CSP.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ assetId: string; name: string }> }
) {
  const { assetId } = await ctx.params
  if (!/^[a-z0-9]{8,40}$/i.test(assetId))
    return new Response("Not found", { status: 404 })
  const asset = await prisma.workspaceAsset.findUnique({
    where: { id: assetId },
    select: { data: true, mime: true, sha256: true, size: true },
  })
  if (!asset) return new Response("Not found", { status: 404 })
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mime,
      "Content-Length": String(asset.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${asset.sha256}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Disposition": "inline",
    },
  })
}
