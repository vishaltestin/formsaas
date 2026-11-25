import { NextResponse } from "next/server"

import { buildOpenApiSpec } from "@/lib/api/openapi"
import { appUrl } from "@/lib/format"

export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json(buildOpenApiSpec(appUrl()), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" },
  })
}
