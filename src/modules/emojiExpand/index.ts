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

      const ext = emoji.animated ? "gif" : "png";
      const imageUrl = `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}?size=256`;

      const embed = new EmbedBuilder()
        .setAuthor({
          name: message.member?.displayName ?? message.author.username,
          iconURL: message.author.displayAvatarURL({ size: 64 }),
        })
        .setImage(imageUrl)
        .setColor(message.member?.displayColor ?? 0x5865f2)
        .setTimestamp(message.createdAt);

      try {
        await message.delete();
      } catch (deleteError) {
        logger.warn({ err: deleteError, channelId: message.channelId, authorId: message.author.id }, "Failed to delete original message");
      }

      try {
        await message.channel.send({ embeds: [embed] });
      } catch (sendError) {
        logger.warn({ err: sendError }, "Failed to send expanded emoji");
      }
    });
  },
};

export default emojiExpandModule;
