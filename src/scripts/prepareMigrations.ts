import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const BASELINE_MIGRATION = "20260312000000_init";
const BASELINE_FILE = `prisma/migrations/${BASELINE_MIGRATION}/migration.sql`;

async function main() {
  const db = new PrismaClient();
  try {
    const [state] = await db.$queryRawUnsafe<Array<{
      core_table: string | null;
      migrations_table: string | null;
    }>>(`
      SELECT
        to_regclass('public.guild_settings')::text AS core_table,
        to_regclass('public._prisma_migrations')::text AS migrations_table
    `);

    if (!state?.core_table || state.migrations_table) return;

    console.log("Existing db-push schema detected; applying and registering the baseline migration");
    execFileSync("npx", ["prisma", "db", "execute", "--file", BASELINE_FILE, "--schema", "prisma/schema.prisma"], {
      stdio: "inherit",
      env: process.env,
    });
    execFileSync("npx", ["prisma", "migrate", "resolve", "--applied", BASELINE_MIGRATION], {
      stdio: "inherit",
      env: process.env,
    });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("Failed to prepare Prisma migration history", error);
  process.exit(1);
});
