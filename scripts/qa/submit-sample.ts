import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../../generated/prisma/client"
import { normalizeSchema, sampleFieldValue, isInputField } from "../../lib/form-engine"

const formId = process.argv[2]
const email = process.argv[3] ?? "respondent@example.com"
const url = new URL(process.env.DATABASE_URL!)
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1) }),
})
const form = await prisma.form.findUniqueOrThrow({ where: { id: formId } })
const schema = normalizeSchema(form.publishedSchema ?? form.draftSchema)
const data: Record<string, unknown> = {}
for (const f of schema.fields) if (isInputField(f)) data[f.key] = f.type === "email" ? email : f.type === "signature" ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" : sampleFieldValue(f)
const res = await fetch(`http://localhost:3000/api/v1/forms/${formId}/submissions`, {
  method: "POST",
  headers: { Authorization: "Bearer fs_live_demo0000000000000000000000000000", "Content-Type": "application/json" },
  body: JSON.stringify({ data }),
})
console.log(res.status, (await res.text()).slice(0, 400))
await prisma.$disconnect()
