import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const migrations = readdirSync("prisma/migrations").sort();

test("a baseline migration creates the core schema before feature migrations", () => {
  assert.equal(migrations[0], "20260312000000_init");
  const sql = readFileSync(`prisma/migrations/${migrations[0]}/migration.sql`, "utf8");
  for (const table of ["guild_settings", "role_panels", "role_panel_items", "audit_events", "custom_commands", "welcome_message"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  }
});

test("Docker startup uses migrations without destructive db push", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  assert.match(dockerfile, /COPY package\.json package-lock\.json/);
  assert.match(dockerfile, /RUN npm ci/);
  assert.match(dockerfile, /node dist\/scripts\/prepareMigrations\.js && npm run migrate:deploy/);
  assert.doesNotMatch(dockerfile, /accept-data-loss|prisma db push/);

  const compose = readFileSync("docker-compose.yml", "utf8");
  assert.match(compose, /node dist\/scripts\/prepareMigrations\.js && npm run migrate:deploy/);
});
