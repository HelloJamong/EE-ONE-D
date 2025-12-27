import { SlashCommandBuilder, ChannelType, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { BotModule, AppContext } from "../../types.js";

function ensureAdministrator(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has("Administrator")) {
    throw new Error("Administrator 권한이 필요합니다.");
  }
}

async function logConfigUpdate(context: AppContext, guildId: string, actorId: string, details: any) {
  await context.db.audit_events.create({
    data: {
      guild_id: guildId,
      event_type: "CONFIG_UPDATED",
      actor_id: actorId,
      channel_id: null,
      target_id: null,
      details,
    },
  });

  const settings = await context.db.guild_settings.findUnique({ where: { guild_id: guildId } });
  if (!settings?.log_channel_id) return;
  const channel = context.client.channels.cache.get(settings.log_channel_id);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const embed = new EmbedBuilder()
    .setTitle("CONFIG_UPDATED")
    .setDescription("길드 설정이 변경되었습니다.")
    .addFields({ name: "변경 내용", value: JSON.stringify(details, null, 2).slice(0, 1000) })
    .setColor(0xfee75c);
  await channel.send({ embeds: [embed] });
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("config")
      .setDescription("길드 설정을 관리합니다.")
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("관리 채널 및 패널 채널을 설정합니다.")
          .addChannelOption((opt) =>
            opt
              .setName("role_channel")
              .setDescription("역할 선택 패널 채널")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
          .addChannelOption((opt) =>
            opt
              .setName("admin_channel")
              .setDescription("관리자 설정 전용 채널")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
          .addChannelOption((opt) =>
            opt
              .setName("log_channel")
              .setDescription("감사 로그 채널")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
      )
      .addSubcommand((sub) => sub.setName("show").setDescription("현재 설정을 확인합니다.")),
    handle: async (interaction, context) => {
      try {
        ensureAdministrator(interaction);
      } catch (error) {
        await interaction.reply({ content: (error as Error).message, ephemeral: true });
        return;
      }

      const guildId = interaction.guildId!;
      const sub = interaction.options.getSubcommand();

      const settings = await context.db.guild_settings.findUnique({
        where: { guild_id: guildId },
      });

      if (sub === "show") {
        await interaction.reply({
          content: [
            `role_panel_channel_id: ${settings?.role_panel_channel_id ?? "-"}`,
            `admin_config_channel_id: ${settings?.admin_config_channel_id ?? "-"}`,
            `log_channel_id: ${settings?.log_channel_id ?? "-"}`,
            `updated_at: ${settings?.updated_at?.toISOString() ?? "-"}`,
          ].join("\n"),
          ephemeral: true,
        });
        return;
      }

      if (settings?.admin_config_channel_id && interaction.channelId !== settings.admin_config_channel_id) {
        await interaction.reply({
          content: `이 명령어는 지정된 관리자 채널에서만 사용할 수 있습니다.`,
          ephemeral: true,
        });
        return;
      }

      const roleChannel = interaction.options.getChannel("role_channel", false);
      const adminChannel = interaction.options.getChannel("admin_channel", false);
      const logChannel = interaction.options.getChannel("log_channel", false);

      const updated = await context.db.guild_settings.upsert({
        where: { guild_id: guildId },
        create: {
          guild_id: guildId,
          role_panel_channel_id: roleChannel?.id,
          admin_config_channel_id: adminChannel?.id,
          log_channel_id: logChannel?.id,
        },
        update: {
          role_panel_channel_id: roleChannel?.id ?? settings?.role_panel_channel_id,
          admin_config_channel_id: adminChannel?.id ?? settings?.admin_config_channel_id,
          log_channel_id: logChannel?.id ?? settings?.log_channel_id,
        },
      });

      await logConfigUpdate(context, guildId, interaction.user.id, {
        role_panel_channel_id: updated.role_panel_channel_id,
        admin_config_channel_id: updated.admin_config_channel_id,
        log_channel_id: updated.log_channel_id,
      });

      await interaction.reply({
        content: [
          "설정을 갱신했습니다.",
          `role_panel_channel_id: ${updated.role_panel_channel_id ?? "-"}`,
          `admin_config_channel_id: ${updated.admin_config_channel_id ?? "-"}`,
          `log_channel_id: ${updated.log_channel_id ?? "-"}`,
        ].join("\n"),
        ephemeral: true,
      });
    },
  },
];

const configModule: BotModule = {
  name: "config",
  commands,
};

export default configModule;
