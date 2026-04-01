import "dotenv/config";
import path from "path";
import { defineConfig } from "prisma/config";

const dbDir = process.env["DATABASE_PATH"] || ".";
const dbUrl = `file:${path.resolve(dbDir, "dev.db")}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] || dbUrl,
  },
});
