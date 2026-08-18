import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import configModule from "../dist/modules/config/index.js";

test("CI validates tests, Prisma schema, and dependencies before changes merge", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /prisma validate/);
  assert.match(workflow, /npm audit/);
});

test("release publishing runs quality checks and reuses Docker build cache", () => {
  const workflow = readFileSync(".github/workflows/docker-publish.yml", "utf8");
  assert.match(workflow, /npm test/);
  assert.match(workflow, /prisma validate/);
  assert.match(workflow, /npm audit/);
  assert.match(workflow, /cache-from: type=gha/);
  assert.match(workflow, /cache-to: type=gha,mode=max/);
  assert.doesNotMatch(workflow, /no-cache:\s*true/);
});

test("safe Discord event handlers contain rejected promises", async () => {
  const { safeEventHandler } = await import("../dist/shared/events.js");
  const errors = [];
  const logger = { error: (...args) => errors.push(args) };
  const client = new EventEmitter();
  client.on("test", safeEventHandler(logger, "test", async () => {
    throw new Error("boom");
  }));

  client.emit("test");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(errors.length, 1);
  assert.equal(errors[0][0].event, "test");
  assert.match(errors[0][0].err.message, /boom/);
});

test("only the configured control guild can update the global bot presence", async () => {
  const { isPresenceController, applyConfiguredPresence } = await import("../dist/shared/presence.js");
  const config = { DISCORD_GUILD_ID: "control-guild" };

  assert.equal(isPresenceController(config, "control-guild"), true);
  assert.equal(isPresenceController(config, "other-guild"), false);
  assert.equal(isPresenceController({}, "control-guild"), false);

  const lookups = [];
  const presences = [];
  await applyConfiguredPresence({
    config,
    db: {
      guild_settings: {
        findUnique: async (query) => {
          lookups.push(query);
          return { activity_type: "PLAYING", activity_text: "테스트 중" };
        },
      },
    },
    client: { user: { setPresence: (presence) => presences.push(presence) } },
    logger: { info() {} },
  });

  assert.deepEqual(lookups[0].where, { guild_id: "control-guild" });
  assert.equal(presences[0].activities[0].name, "테스트 중");
});

test("bot status changes are denied outside the configured control guild", async () => {
  let upserted = false;
  const replies = [];
  await configModule.commands[0].handle({
    guildId: "other-guild",
    memberPermissions: { has: () => true },
    options: {
      getSubcommand: () => "bot_status",
      getString: () => "PLAYING",
    },
    reply: async (payload) => replies.push(payload),
  }, {
    config: { DISCORD_GUILD_ID: "control-guild" },
    db: {
      guild_settings: {
        findUnique: async () => null,
        upsert: async () => { upserted = true; },
      },
    },
  });

  assert.equal(upserted, false);
  assert.match(replies[0].content, /운영 서버에서만/);
});

test("configured channels can be cleared explicitly", async () => {
  let update;
  const replies = [];
  const settings = {
    guild_id: "guild-1",
    admin_config_channel_id: null,
    log_channel_id: "log-channel",
  };
  await configModule.commands[0].handle({
    guildId: "guild-1",
    channelId: "admin-channel",
    user: { id: "admin-1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommand: () => "clear",
      getString: (name) => name === "setting" ? "log_channel" : null,
    },
    reply: async (payload) => replies.push(payload),
  }, {
    config: { DISCORD_GUILD_ID: "guild-1" },
    db: {
      guild_settings: {
        findUnique: async () => settings,
        update: async (query) => {
          update = query;
          return { ...settings, log_channel_id: null };
        },
      },
      audit_events: { create: async () => {} },
    },
    client: { channels: { cache: new Map() } },
  });

  assert.deepEqual(update.data, { log_channel_id: null });
  assert.match(replies[0].content, /초기화/);
});
