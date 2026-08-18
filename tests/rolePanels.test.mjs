import assert from "node:assert/strict";
import { test } from "node:test";
import rolePanelsModule from "../dist/modules/rolePanels/index.js";

test("panel deletion requires the panel to belong to the interaction guild", async () => {
  let panelLookup;
  let deleted = false;
  const replies = [];
  const interaction = {
    guildId: "guild-b",
    channelId: "admin-channel",
    memberPermissions: { has: () => true },
    options: {
      getSubcommand: () => "delete",
      getString: (name) => name === "panel_id" ? "panel-from-guild-a" : null,
      getBoolean: () => false,
    },
    reply: async (payload) => replies.push(payload),
  };
  const context = {
    db: {
      guild_settings: { findUnique: async () => null },
      role_panels: {
        findFirst: async (args) => {
          panelLookup = args;
          return null;
        },
        delete: async () => { deleted = true; },
      },
      role_panel_items: {
        deleteMany: async () => { deleted = true; },
      },
    },
    logger: { warn() {}, error() {} },
  };

  await rolePanelsModule.commands[0].handle(interaction, context);

  assert.deepEqual(panelLookup.where, { id: "panel-from-guild-a", guild_id: "guild-b" });
  assert.equal(deleted, false);
  assert.match(replies[0].content, /패널을 찾을 수 없습니다/);
});
