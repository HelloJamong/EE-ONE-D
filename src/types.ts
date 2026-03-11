import { Client, ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder, REST } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { Logger } from "pino";
import { AppConfig } from "./shared/env.js";

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  db: PrismaClient;
  cache: Map<string, unknown>;
  client: Client;
  rest: REST;
  staticCommands: SlashCommand[];
}

export interface BotModule {
  name: string;
  commands?: SlashCommand[];
  register?(context: AppContext): void;
}

export interface SlashCommand {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  handle: (interaction: ChatInputCommandInteraction, context: AppContext) => Promise<void>;
}
