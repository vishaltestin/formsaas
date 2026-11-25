#!/usr/bin/env node
/**
 * Starts the production build on an isolated port, runs the E2E suite against
 * it and shuts it down again. Requires `npm run build` first.
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"

const PORT = process.env.E2E_PORT ?? "3100"
const BASE = `http://127.0.0.1:${PORT}`

if (!existsSync(".next/BUILD_ID")) {
  console.error("No production build found. Run `npm run build` first.")
  process.exit(1)
}

const server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", PORT], { stdio: ["ignore", "pipe", "pipe"], detached: true, env: process.env })
let log = ""
server.stdout.on("data", (d) => (log += d))
server.stderr.on("data", (d) => (log += d))

const stop = () => {
  try {
    process.kill(-server.pid, "SIGTERM")
  } catch {
    /* already gone */
  }
}
process.on("SIGINT", () => {
  stop()
  process.exit(130)
})

let ready = false
for (let i = 0; i < 120 && !ready; i++) {
  try {
    const r = await fetch(`${BASE}/api/v1/openapi.json`)
    ready = r.ok
  } catch {
    await sleep(1000)
  }
}
if (!ready) {
  console.error("Server did not become ready:\n" + log)
  stop()
  process.exit(1)
}
console.log(`› E2E server ready on ${BASE}`)

const tests = spawn("npx", ["tsx", "--conditions=react-server", "--test", "--test-concurrency=1", "tests/e2e/flows.test.ts"], { stdio: "inherit", env: { ...process.env, E2E_BASE_URL: BASE } })
const code = await new Promise((resolve) => tests.on("exit", (c) => resolve(c ?? 1)))
stop()
if (code !== 0) console.error("\nServer log tail:\n" + log.split("\n").slice(-40).join("\n"))
process.exit(code)
