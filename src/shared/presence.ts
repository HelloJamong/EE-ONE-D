import { ActivityType } from "discord.js";
import { AppConfig } from "./env.js";
import { AppContext } from "../types.js";

const DEFAULT_ACTIVITY = "BIG BROTHER IS WATCHING YOU";

const activityTypeMap: Record<string, ActivityType> = {
  PLAYING: ActivityType.Playing,
  WATCHING: ActivityType.Watching,
  LISTENING: ActivityType.Listening,
};

export function isPresenceController(
  config: Pick<AppConfig, "DISCORD_GUILD_ID"> | { DISCORD_GUILD_ID?: string },
  guildId: string | null
): boolean {
  return !!config.DISCORD_GUILD_ID && config.DISCORD_GUILD_ID === guildId;
}

export function setBotPresence(
  context: Pick<AppContext, "client">,
  activityType?: string | null,
  activityText?: string | null
) {
  context.client.user?.setPresence({
    activities: [{
      name: activityText || DEFAULT_ACTIVITY,
      type: activityTypeMap[activityType ?? ""] ?? ActivityType.Watching,
    }],
    status: "online",
  });
}

export async function applyConfiguredPresence(
  context: Pick<AppContext, "config" | "db" | "client" | "logger">
) {
  const guildId = context.config.DISCORD_GUILD_ID;
  const settings = guildId
    ? await context.db.guild_settings.findUnique({
        where: { guild_id: guildId },
        select: { activity_type: true, activity_text: true },
      })
    : null;

  setBotPresence(context, settings?.activity_type, settings?.activity_text);
  if (settings?.activity_type && settings.activity_text) {
    context.logger.info({ guildId, activity: settings }, "Bot activity set from control guild");
  }
}
