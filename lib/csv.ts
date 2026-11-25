/**
 * CSV helpers with spreadsheet formula-injection protection (CWE-1236):
 * cells starting with = + - @ TAB CR (and their full-width variants) are
 * prefixed with a single quote so Excel/Sheets treat them as text. Plain
 * numbers such as "-12.5" are left untouched.
 */
const DANGEROUS = /^[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20]/
const NUMBER = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i

export function neutralizeFormula(s: string) {
  return DANGEROUS.test(s) && !NUMBER.test(s) ? `'${s}` : s
}

export function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)
  const safe = neutralizeFormula(s)
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(rows: unknown[][]) {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n")
}
