export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail(error: unknown, fallback = "Something went wrong"): { ok: false; error: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as { capability?: string }).capability ? "ENTITLEMENT" : undefined
    return { ok: false, error: error.message || fallback, code }
  }
  return { ok: false, error: typeof error === "string" ? error : fallback }
}
