import { Client, ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { Logger } from "pino";
import { AppConfig } from "./shared/env.js";

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  db: PrismaClient;
  cache: Map<string, unknown>;
  client: Client;
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
