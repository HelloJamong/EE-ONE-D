import { EmbedBuilder } from "discord.js";
import { BotModule, AppContext } from "../../types.js";

const CUSTOM_EMOJI_REGEX = /^<(?<animated>a?):\w+:(?<id>\d+)>$/;

function extractCustomEmoji(content: string) {
  const match = content.trim().match(CUSTOM_EMOJI_REGEX);
  if (!match?.groups) return null;
  return {
    id: match.groups.id,
    animated: match.groups.animated === "a",
  };
}

const emojiExpandModule: BotModule = {
  name: "emojiExpand",
  register: (context: AppContext) => {
    const { client, logger } = context;
    client.on("messageCreate", async (message) => {
      if (!message.guild || message.author.bot) return;
      const emoji = extractCustomEmoji(message.content);
      if (!emoji) return;

      try {
        const embed = new EmbedBuilder()
          .setTitle("커스텀 이모지")
          .setImage(`https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?size=1024`)
          .setColor(0x5865f2);

        await message.delete();
        await message.channel.send({ embeds: [embed] });
      } catch (error) {
        logger.warn({ err: error }, "Failed to expand emoji");
      }
    });
  },
};

export default emojiExpandModule;
