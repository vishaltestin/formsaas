import { NextResponse, type NextRequest } from "next/server"

/**
 * Optimistic auth gate: bounces anonymous visitors away from the app before
 * any rendering happens. Authoritative checks (session validity, ADMIN role,
 * form ownership) still run server-side in layouts, pages and actions.
 */
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"]

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) =>
    request.cookies.getAll().some((c) => c.name === name || c.name.startsWith(`${name}.`))
  )
  const { pathname, search } = request.nextUrl

  if (!hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
}
