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
  // Instagram GraphQL 비공개 API 값. IG가 스키마를 바꾸면 깨지므로 재배포 없이 갱신 가능하도록 env로 분리.
  IG_DOC_ID: z.string().default("10015901848480474"),
  IG_APP_ID: z.string().default("936619743392459"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const parsed = envSchema.parse(process.env);
  if (parsed.COMMAND_SCOPE === "guild" && !parsed.DISCORD_GUILD_ID) {
    throw new Error("COMMAND_SCOPE is 'guild' but DISCORD_GUILD_ID is missing");
  }
  return parsed;
}
