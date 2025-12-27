import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
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
  commands: SlashCommandBuilder[],
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

export async function dispatchCommand(
  interaction: ChatInputCommandInteraction,
  commands: SlashCommand[],
  context: AppContext
) {
  const command = commands.find((cmd) => cmd.data.name === interaction.commandName);
  if (!command) {
    await interaction.reply({ content: "알 수 없는 명령어입니다.", ephemeral: true });
    return;
  }
  try {
    await command.handle(interaction, context);
  } catch (error) {
    context.logger.error({ err: error }, "Command execution failed");
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: "명령 실행 중 오류가 발생했습니다.", ephemeral: true });
    } else {
      await interaction.reply({ content: "명령 실행 중 오류가 발생했습니다.", ephemeral: true });
    }
  }
}
