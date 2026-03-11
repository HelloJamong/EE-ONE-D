import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { AppConfig } from "./env.js";
import { Logger } from "pino";
import { SlashCommand, AppContext } from "../types.js";

export function createDiscordClient(config: AppConfig) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.GuildMember,
      Partials.User,
      Partials.Reaction,
    ],
  });

  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
  return { client, rest };
}

export async function registerCommands(
  commands: (SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder)[],
  rest: REST,
  config: AppConfig,
  logger: Logger
) {
  const body = commands.map((cmd) => cmd.toJSON());

  if (config.COMMAND_SCOPE === "guild" && config.DISCORD_GUILD_ID) {
    logger.info({ guild: config.DISCORD_GUILD_ID }, "Registering guild commands");
    await rest.put(
      Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
      { body }
    );
  } else {
    logger.info("Registering global commands");
    await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body });
  }
}

export async function registerAllCommands(
  staticCommands: (SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder)[],
  customCommands: Array<{ name: string; description: string }>,
  rest: REST,
  config: AppConfig,
  logger: Logger
) {
  const customSlashCommands = customCommands.map((cmd) =>
    new SlashCommandBuilder()
      .setName(cmd.name)
      .setDescription(cmd.description || "커스텀 명령어")
      .toJSON()
  );

  const body = [
    ...staticCommands.map((cmd) => cmd.toJSON()),
    ...customSlashCommands,
  ];

  if (config.COMMAND_SCOPE === "guild" && config.DISCORD_GUILD_ID) {
    logger.info({ guild: config.DISCORD_GUILD_ID, count: body.length }, "Registering commands");
    await rest.put(
      Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
      { body }
    );
  } else {
    logger.info({ count: body.length }, "Registering global commands");
    await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body });
  }
}

export async function dispatchCommand(
  interaction: ChatInputCommandInteraction,
  commands: SlashCommand[],
  context: AppContext
) {
  // 1. 고정 명령어 찾기
  const staticCommand = commands.find((cmd) => cmd.data.name === interaction.commandName);
  if (staticCommand) {
    try {
      await staticCommand.handle(interaction, context);
    } catch (error) {
      context.logger.error({ err: error }, "Command execution failed");
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: "명령 실행 중 오류가 발생했습니다.", ephemeral: true });
      } else {
        await interaction.reply({ content: "명령 실행 중 오류가 발생했습니다.", ephemeral: true });
      }
    }
    return;
  }

  // 2. 커스텀 명령어 찾기
  const customCommand = await context.db.custom_commands.findUnique({
    where: {
      guild_id_name: {
        guild_id: interaction.guildId!,
        name: interaction.commandName,
      },
    },
  });

  if (customCommand) {
    try {
      await interaction.reply({ content: customCommand.response, ephemeral: false });
    } catch (error) {
      context.logger.error({ err: error }, "Custom command execution failed");
      await interaction.reply({ content: "명령 실행 중 오류가 발생했습니다.", ephemeral: true });
    }
    return;
  }

  // 3. 명령어를 찾을 수 없음
  await interaction.reply({ content: "알 수 없는 명령어입니다.", ephemeral: true });
}
