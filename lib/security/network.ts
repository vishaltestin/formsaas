import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

/**
 * SSRF guard for user-supplied hosts (workspace SMTP servers). The hostname is
 * resolved once, every address must be public, and the caller connects to the
 * resolved IP (with TLS SNI set to the hostname) so DNS can't be re-pointed at
 * an internal address between the check and the connection.
 */

function v4ToInt(ip: string) {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
]

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) {
    const n = v4ToInt(ip)
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
      return (n & mask) === (v4ToInt(base) & mask)
    })
  }
  if (kind === 6) {
    const v = ip.toLowerCase().replace(/^\[|\]$/g, "")
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
    if (mapped) return isPrivateAddress(mapped[1])
    if (v === "::" || v === "::1") return true
    const first = parseInt(v.split(":")[0] || "0", 16)
    if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true // multicast
    return false
  }
  return true // not an IP at all → treat as unsafe
}

const HOST_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i

export function isValidHostname(host: string) {
  return HOST_RE.test(host) || isIP(host) !== 0
}

export class UnsafeHostError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeHostError"
  }
}

export function privateNetworkAllowed(env: Record<string, string | undefined> = process.env) {
  return env.ALLOW_PRIVATE_NETWORK_REQUESTS === "true" || env.NODE_ENV === "test"
}

/** Resolves `host` and returns the address to connect to, refusing private/internal targets. */
export async function resolvePublicHost(host: string, allowPrivate = privateNetworkAllowed()): Promise<string> {
  const h = host.trim().toLowerCase()
  if (!isValidHostname(h)) throw new UnsafeHostError(`“${host}” is not a valid hostname.`)
  if (!allowPrivate && /(^|\.)(localhost|local|internal|localdomain)$/.test(h)) throw new UnsafeHostError("Internal hostnames are not allowed.")
  const addrs = isIP(h) ? [{ address: h }] : await lookup(h, { all: true, verbatim: true }).catch(() => [])
  if (addrs.length === 0) throw new UnsafeHostError(`Could not resolve ${host}.`)
  if (!allowPrivate && addrs.some((a) => isPrivateAddress(a.address))) throw new UnsafeHostError(`${host} resolves to a private network address, which is blocked.`)
  return addrs[0].address
}
