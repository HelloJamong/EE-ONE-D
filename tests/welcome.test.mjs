import assert from "node:assert/strict";
import { test } from "node:test";
import welcomeModule from "../dist/modules/welcome/index.js";

test("welcome edit opens a modal without acknowledging the interaction first", async () => {
  const calls = [];
  const interaction = {
    guildId: "guild-1",
    memberPermissions: { has: () => true },
    options: { getSubcommand: () => "edit" },
    deferReply: async () => { throw new Error("edit must not defer before showModal"); },
    reply: async (payload) => calls.push(["reply", payload]),
    showModal: async () => calls.push(["showModal"]),
  };
  const context = {
    db: {
      welcome_message: {
        findUnique: async () => ({
          title: "환영합니다",
          content: "내용",
          button_emoji: null,
          button_label: "확인",
          role_ids: ["role-1"],
        }),
      },
    },
  };

  await welcomeModule.commands[0].handle(interaction, context);
  assert.deepEqual(calls, [["showModal"]]);
});
