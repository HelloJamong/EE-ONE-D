import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  COMMAND_SCOPE: z.enum(["global", "guild"]),
  DISCORD_GUILD_ID: z.string().optional(),
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.string().default("production"),
  LOG_LEVEL: z.string().default("info"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const parsed = envSchema.parse(process.env);
  if (parsed.COMMAND_SCOPE === "guild" && !parsed.DISCORD_GUILD_ID) {
    throw new Error("COMMAND_SCOPE is 'guild' but DISCORD_GUILD_ID is missing");
  }
  return parsed;
}
