// Prisma 7 configuration. Run CLI commands with `--config prisma7.config.ts`
// (wired through the npm `db:*` scripts in package.json).
import "dotenv/config"
import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
})
