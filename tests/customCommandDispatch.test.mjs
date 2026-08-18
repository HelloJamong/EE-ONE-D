import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchCommand } from "../dist/shared/discord.js";

function createContext(response) {
  return {
    db: {
      custom_commands: {
        findUnique: async () => ({ response }),
      },
    },
    logger: { error() {} },
  };
}

function createInteraction() {
  const sent = [];
  return {
    commandName: "custom",
    guildId: "guild-1",
    deferred: false,
    replied: false,
    reply: async (payload) => sent.push(["reply", payload]),
    followUp: async (payload) => sent.push(["followUp", payload]),
    sent,
  };
}

test("custom embed dispatch preserves its title and description", async () => {
  const interaction = createInteraction();
  await dispatchCommand(
    interaction,
    [],
    createContext("EMBED:서버 점검 안내|||오늘 밤 12시에 점검합니다."),
  );

  assert.equal(interaction.sent.length, 1);
  const embed = interaction.sent[0][1].embeds[0].toJSON();
  assert.equal(embed.title, "서버 점검 안내");
  assert.equal(embed.description, "오늘 밤 12시에 점검합니다.");
});

test("long plain custom responses are sent in Discord-safe chunks", async () => {
  const interaction = createInteraction();
  await dispatchCommand(interaction, [], createContext("x".repeat(4000)));

  assert.deepEqual(interaction.sent.map(([method, payload]) => [method, payload.content.length]), [
    ["reply", 2000],
    ["followUp", 2000],
  ]);
});

test("commands are rejected cleanly outside a guild", async () => {
  const interaction = createInteraction();
  interaction.guildId = null;
  await dispatchCommand(interaction, [], createContext("응답"));

  assert.equal(interaction.sent.length, 1);
  assert.match(interaction.sent[0][1].content, /서버에서만/);
});
