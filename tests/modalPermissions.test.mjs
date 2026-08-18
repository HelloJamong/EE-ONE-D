import assert from "node:assert/strict";
import { test } from "node:test";
import { handleAddModal } from "../dist/modules/customCommands/modals.js";
import { handleSendModal } from "../dist/modules/notifications/modals.js";

function deniedModalInteraction(customId) {
  const replies = [];
  return {
    customId,
    guildId: "guild-1",
    channelId: "admin-channel",
    memberPermissions: { has: () => false },
    deferReply: async () => {},
    editReply: async (payload) => replies.push(payload),
    replies,
  };
}

function deniedContext() {
  let wrote = false;
  return {
    context: {
      db: {
        guild_settings: { findUnique: async () => null },
        custom_commands: { create: async () => { wrote = true; } },
        audit_events: { create: async () => { wrote = true; } },
      },
      logger: { error() {} },
    },
    wrote: () => wrote,
  };
}

test("custom command modal submission rechecks administrator permission", async () => {
  const interaction = deniedModalInteraction("cmd_add_modal");
  const { context, wrote } = deniedContext();

  await handleAddModal(interaction, context);

  assert.equal(wrote(), false);
  assert.match(interaction.replies[0].content, /Administrator/);
});

test("notification modal submission rechecks administrator permission", async () => {
  const interaction = deniedModalInteraction("noti_send_modal");
  const { context, wrote } = deniedContext();

  await handleSendModal(interaction, context);

  assert.equal(wrote(), false);
  assert.match(interaction.replies[0].content, /Administrator/);
});
