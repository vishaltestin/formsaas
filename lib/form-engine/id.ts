const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

/** Short, collision-resistant id usable on client and server. */
export function uid(prefix = "id") {
  let out = ""
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(10)
    cryptoObj.getRandomValues(bytes)
    for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  } else {
    for (let i = 0; i < 10; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return `${prefix}_${out}`
}
