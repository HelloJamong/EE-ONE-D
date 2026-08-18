import assert from "node:assert/strict";
import { test } from "node:test";
import { createSendModal } from "../dist/modules/notifications/modals.js";
import helpModule from "../dist/modules/help/index.js";

test("notification modal content fits inside a Discord message with its title", () => {
  const modal = createSendModal().toJSON();
  const titleInput = modal.components[0].components[0];
  const contentInput = modal.components[1].components[0];
  assert.ok(titleInput.max_length + contentInput.max_length + 6 <= 2000);
});

test("help embed fields stay within Discord field limits", async () => {
  let sentEmbed;
  const interaction = {
    guildId: "guild-1",
    memberPermissions: { has: () => true },
    user: {
      id: "user-1",
      send: async ({ embeds }) => { sentEmbed = embeds[0].toJSON(); },
    },
    reply: async () => {},
  };
  const customCommands = Array.from({ length: 30 }, (_, index) => ({
    name: `command-${index}`,
    description: "x".repeat(100),
    response: "response",
  }));
  const staticCommands = Array.from({ length: 30 }, (_, index) => ({
    data: { name: `static-${index}`, description: "y".repeat(100) },
  }));

  await helpModule.commands[0].handle(interaction, {
    db: { custom_commands: { findMany: async () => customCommands } },
    staticCommands,
    logger: { warn() {}, error() {} },
  });

  assert.ok(sentEmbed.fields.every((field) => field.value.length <= 1024));
});
