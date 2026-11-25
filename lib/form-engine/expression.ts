/**
 * Safe formula language used by calculated fields and SET_VALUE/CALCULATE logic.
 *
 * Grammar (recursive descent, no `eval`, no property access, no globals):
 *   expr     := ternary
 *   ternary  := or ( "?" expr ":" expr )?
 *   or       := and ( "||" and )*
 *   and      := cmp ( "&&" cmp )*
 *   cmp      := add ( ( "==" | "!=" | ">" | ">=" | "<" | "<=" ) add )?
 *   add      := mul ( ( "+" | "-" ) mul )*
 *   mul      := pow ( ( "*" | "/" | "%" ) pow )*
 *   pow      := unary ( "^" pow )?
 *   unary    := ( "-" | "+" | "!" ) unary | call
 *   call     := IDENT "(" args? ")" | NUMBER | "(" expr ")"
 *
 * Booleans are numbers (1/0). Division by zero yields 0. Results are rounded
 * to 6 decimals to avoid floating point noise. Input length and recursion depth
 * are bounded so user formulas can't hang the server.
 */

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }

const MAX_LENGTH = 2000
const MAX_DEPTH = 64
const OPS = ["==", "!=", ">=", "<=", "&&", "||", ">", "<", "+", "-", "*", "/", "%", "^", "(", ")", ",", "!", "?", ":"]

export const FORMULA_FUNCTIONS: Record<string, { args: string; description: string; fn: (...a: number[]) => number }> = {
  round: { args: "x, decimals?", description: "Round to N decimals", fn: (x, d = 0) => { const f = 10 ** Math.max(0, Math.min(10, Math.trunc(d))); return Math.round(x * f) / f } },
  floor: { args: "x", description: "Round down", fn: (x) => Math.floor(x) },
  ceil: { args: "x", description: "Round up", fn: (x) => Math.ceil(x) },
  abs: { args: "x", description: "Absolute value", fn: (x) => Math.abs(x) },
  min: { args: "a, b, …", description: "Smallest value", fn: (...a) => (a.length ? Math.min(...a) : 0) },
  max: { args: "a, b, …", description: "Largest value", fn: (...a) => (a.length ? Math.max(...a) : 0) },
  sum: { args: "a, b, …", description: "Total", fn: (...a) => a.reduce((x, y) => x + y, 0) },
  avg: { args: "a, b, …", description: "Average", fn: (...a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0) },
  clamp: { args: "x, lo, hi", description: "Limit x to [lo, hi]", fn: (x, lo, hi) => Math.min(Math.max(x, lo), hi) },
  if: { args: "cond, then, else", description: "Conditional", fn: (c, a, b) => (c ? a : b) },
  sqrt: { args: "x", description: "Square root", fn: (x) => (x < 0 ? 0 : Math.sqrt(x)) },
}

function tokenize(src: string): Token[] {
  if (src.length > MAX_LENGTH) throw new Error("Formula is too long")
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      const n = Number(src.slice(i, j))
      if (Number.isNaN(n)) throw new Error(`Invalid number "${src.slice(i, j)}"`)
      tokens.push({ t: "num", v: n })
      i = j
      continue
    }
    if (/[a-z_]/i.test(c)) {
      let j = i
      while (j < src.length && /[a-z0-9_]/i.test(src[j])) j++
      tokens.push({ t: "id", v: src.slice(i, j).toLowerCase() })
      i = j
      continue
    }
    const op = OPS.find((o) => src.startsWith(o, i))
    if (op) {
      tokens.push({ t: "op", v: op })
      i += op.length
      continue
    }
    throw new Error(`Unexpected character "${c}"`)
  }
  return tokens
}

export function evaluateExpression(src: string, vars: Record<string, number> = {}): number {
  const tokens = tokenize(src)
  let pos = 0
  let depth = 0
  const peek = () => tokens[pos]
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v
  const expect = (v: string) => {
    const tok = tokens[pos++]
    if (!tok || tok.t !== "op" || tok.v !== v) throw new Error(`Expected "${v}"`)
  }
  const enter = () => {
    if (++depth > MAX_DEPTH) throw new Error("Formula is nested too deeply")
  }

  function expr(): number {
    enter()
    const v = ternary()
    depth--
    return v
  }
  function ternary(): number {
    const c = or()
    if (isOp("?")) {
      pos++
      const a = expr()
      expect(":")
      const b = expr()
      return c ? a : b
    }
    return c
  }
  function or(): number {
    let v = and()
    while (isOp("||")) {
      pos++
      const r = and()
      v = v || r ? 1 : 0
    }
    return v
  }
  function and(): number {
    let v = cmp()
    while (isOp("&&")) {
      pos++
      const r = cmp()
      v = v && r ? 1 : 0
    }
    return v
  }
  function cmp(): number {
    const l = add()
    const tok = peek()
    if (tok?.t === "op" && ["==", "!=", ">", ">=", "<", "<="].includes(tok.v)) {
      pos++
      const r = add()
      switch (tok.v) {
        case "==":
          return l === r ? 1 : 0
        case "!=":
          return l !== r ? 1 : 0
        case ">":
          return l > r ? 1 : 0
        case ">=":
          return l >= r ? 1 : 0
        case "<":
          return l < r ? 1 : 0
        default:
          return l <= r ? 1 : 0
      }
    }
    return l
  }
  function add(): number {
    let v = mul()
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].v
      const r = mul()
      v = op === "+" ? v + r : v - r
    }
    return v
  }
  function mul(): number {
    let v = pow()
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = tokens[pos++].v
      const r = pow()
      if (op === "*") v *= r
      else if (op === "/") v = r === 0 ? 0 : v / r
      else v = r === 0 ? 0 : v % r
    }
    return v
  }
  function pow(): number {
    const base = unary()
    if (isOp("^")) {
      pos++
      enter()
      const e = pow()
      depth--
      const r = base ** e
      return Number.isFinite(r) ? r : 0
    }
    return base
  }
  function unary(): number {
    if (isOp("-")) {
      pos++
      enter()
      const v = -unary()
      depth--
      return v
    }
    if (isOp("+")) {
      pos++
      return unary()
    }
    if (isOp("!")) {
      pos++
      return unary() ? 0 : 1
    }
    return primary()
  }
  function primary(): number {
    const tok = tokens[pos++]
    if (!tok) throw new Error("Unexpected end of formula")
    if (tok.t === "num") return tok.v
    if (tok.t === "id") {
      if (tok.v === "true") return 1
      if (tok.v === "false") return 0
      const fn = FORMULA_FUNCTIONS[tok.v]
      if (fn && isOp("(")) {
        pos++
        const args: number[] = []
        if (!isOp(")")) {
          args.push(expr())
          while (isOp(",")) {
            pos++
            args.push(expr())
          }
        }
        expect(")")
        if (args.length > 100) throw new Error("Too many arguments")
        // `if` is evaluated eagerly; all args are already-safe numbers.
        return fn.fn(...args)
      }
      if (Object.prototype.hasOwnProperty.call(vars, tok.v)) return vars[tok.v]
      throw new Error(fn ? `${tok.v}() needs parentheses` : `Unknown name "${tok.v}"`)
    }
    if (tok.v === "(") {
      const v = expr()
      expect(")")
      return v
    }
    throw new Error(`Unexpected "${tok.v}"`)
  }

  if (tokens.length === 0) throw new Error("Formula is empty")
  const result = expr()
  if (pos !== tokens.length) throw new Error("Unexpected trailing input")
  if (!Number.isFinite(result)) return 0
  return Math.round(result * 1e6) / 1e6
}

export function safeEvaluate(src: string, vars?: Record<string, number>): number | null {
  try {
    if (!src.trim()) return null
    return evaluateExpression(src, vars)
  } catch {
    return null
  }
}

/** Validates a formula and returns a human-readable error, or null when valid. */
export function formulaError(src: string, knownKeys: string[] = []): string | null {
  try {
    const substituted = src.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
      if (key !== "score" && knownKeys.length && !knownKeys.includes(key)) throw new Error(`Unknown field "{{${key}}}"`)
      return "1"
    })
    evaluateExpression(substituted)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid formula"
  }
}
