import { loadConfig } from "./shared/env.js";
import { createLogger } from "./shared/logger.js";
import { getPrisma } from "./shared/db.js";
import { createDiscordClient, registerCommands, dispatchCommand } from "./shared/discord.js";
import { BotModule, AppContext, SlashCommand } from "./types.js";
import configModule from "./modules/config/index.js";
import rolePanelsModule from "./modules/rolePanels/index.js";
import emojiExpandModule from "./modules/emojiExpand/index.js";
import dcEmbedModule from "./modules/dcEmbed/index.js";
import auditModule from "./modules/audit/index.js";

const config = loadConfig();
const logger = createLogger(config);
const db = getPrisma(config);
const { client, rest } = createDiscordClient(config);
const cache = new Map<string, unknown>();

const context: AppContext = {
  config,
  logger,
  db,
  cache,
  client,
};

const modules: BotModule[] = [
  configModule,
  rolePanelsModule,
  emojiExpandModule,
  dcEmbedModule,
  auditModule,
];

const commands: SlashCommand[] = modules.flatMap((mod) => mod.commands ?? []);

async function bootstrap() {
  logger.info("Starting EE-ONE-D bot");
  await db.$connect();
  await registerCommands(
    commands.map((cmd) => cmd.data),
    rest,
    config,
    logger
  );

  modules.forEach((mod) => mod.register?.(context));

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
      await dispatchCommand(interaction, commands, context);
    }
  });

  client.once("ready", () => {
    logger.info({ tag: client.user?.tag }, "Bot is ready");
  });

  await client.login(config.DISCORD_TOKEN);
}

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start bot");
  process.exit(1);
});
