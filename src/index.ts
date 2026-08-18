import { loadConfig } from "./shared/env.js";
import { createLogger } from "./shared/logger.js";
import { getPrisma } from "./shared/db.js";
import { createDiscordClient, registerAllCommands, dispatchCommand } from "./shared/discord.js";
import { BotModule, AppContext, SlashCommand } from "./types.js";
import configModule from "./modules/config/index.js";
import rolePanelsModule from "./modules/rolePanels/index.js";
import emojiExpandModule from "./modules/emojiExpand/index.js";
import dcEmbedModule from "./modules/dcEmbed/index.js";
import igEmbedModule from "./modules/igEmbed/index.js";
import auditModule from "./modules/audit/index.js";
import customCommandsModule from "./modules/customCommands/index.js";
import roleStatsModule from "./modules/roleStats/index.js";
import notificationsModule from "./modules/notifications/index.js";
import welcomeModule from "./modules/welcome/index.js";
import helpModule from "./modules/help/index.js";
import versionModule from "./modules/version/index.js";
import { safeEventHandler } from "./shared/events.js";
import { applyConfiguredPresence } from "./shared/presence.js";

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
  rest,
  staticCommands: [],
};

const modules: BotModule[] = [
  configModule,
  rolePanelsModule,
  emojiExpandModule,
  dcEmbedModule,
  igEmbedModule,
  auditModule,
  customCommandsModule,
  roleStatsModule,
  notificationsModule,
  welcomeModule,
  helpModule,
  versionModule,
];

const commands: SlashCommand[] = modules.flatMap((mod) => mod.commands ?? []);
context.staticCommands = commands;

async function bootstrap() {
  logger.info("Starting EE-ONE-D bot");
  await db.$connect();

  // 커스텀 명령어 로드
  const customCmds = await db.custom_commands.findMany({
    select: { name: true, description: true, response: true },
  });

  // 고정 + 동적 명령어 모두 등록
  await registerAllCommands(
    commands.map((cmd) => cmd.data),
    customCmds.map((c) => ({ name: c.name, description: c.description || "커스텀 명령어" })),
    rest,
    config,
    logger
  );

  modules.forEach((mod) => mod.register?.(context));

  client.on("interactionCreate", safeEventHandler(logger, "core:interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
      await dispatchCommand(interaction, commands, context);
    }
  }));

  client.once("ready", safeEventHandler(logger, "core:ready", async () => {
    logger.info({ tag: client.user?.tag }, "Bot is ready");
    await applyConfiguredPresence(context);
  }));

  await client.login(config.DISCORD_TOKEN);
}

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start bot");
  process.exit(1);
});
