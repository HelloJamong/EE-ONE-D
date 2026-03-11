import {
  EmbedBuilder,
  GuildMember,
  Message,
  PartialGuildMember,
  PartialMessage,
  VoiceState,
  ChannelType,
  TextChannel,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { BotModule, AppContext } from "../../types.js";

const COLORS: Record<string, number> = {
  VOICE_JOIN: 0x57f287,
  VOICE_LEAVE: 0xed4245,
  MESSAGE_DELETE: 0xed4245,
  MESSAGE_EDIT: 0xfee75c,
  MEMBER_JOIN: 0x57f287,
  MEMBER_LEAVE: 0xed4245,
  ROLE_GRANTED: 0x5865f2,
  ROLE_REVOKED: 0x5865f2,
  CONFIG_UPDATED: 0xfee75c,
};

async function fetchSettings(context: AppContext, guildId: string) {
  return context.db.guild_settings.findUnique({ where: { guild_id: guildId } });
}

async function isAuditEnabled(context: AppContext, guildId: string): Promise<boolean> {
  const settings = await fetchSettings(context, guildId);
  return settings?.audit_enabled === true && !!settings?.log_channel_id;
}

interface SendLogOptions {
  fields?: { name: string; value: string; inline?: boolean }[];
  imageUrl?: string;
}

async function sendLog(
  context: AppContext,
  guildId: string,
  eventType: string,
  details: any,
  messageBuilder: () => string,
  options: SendLogOptions = {}
) {
  const enabled = await isAuditEnabled(context, guildId);
  if (!enabled) return;

  await context.db.audit_events.create({
    data: {
      guild_id: guildId,
      event_type: eventType,
      actor_id: details.actor_id,
      channel_id: details.channel_id,
      target_id: details.target_id,
      details,
    },
  });

  const settings = await fetchSettings(context, guildId);
  if (!settings?.log_channel_id) return;
  const channel = context.client.channels.cache.get(settings.log_channel_id) as TextChannel;
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const embed = new EmbedBuilder()
    .setTitle(eventType)
    .setDescription(messageBuilder())
    .setColor(COLORS[eventType] ?? 0x2f3136)
    .setTimestamp(new Date());

  if (options.fields?.length) {
    embed.addFields(options.fields);
  }

  if (options.imageUrl) {
    embed.setImage(options.imageUrl);
  }

  await channel.send({ embeds: [embed] });
}

function displayUser(user: any) {
  return `${user?.tag ?? user?.username ?? "unknown"} (${user?.id ?? "-"})`;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("audit")
      .setDescription("감사 로그를 관리합니다.")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((sub) =>
        sub.setName("on").setDescription("감사 로그를 활성화합니다.")
      )
      .addSubcommand((sub) =>
        sub.setName("off").setDescription("감사 로그를 비활성화합니다.")
      )
      .addSubcommand((sub) =>
        sub
          .setName("channel")
          .setDescription("로그 채널을 설정합니다.")
          .addChannelOption((opt) =>
            opt
              .setName("channel")
              .setDescription("로그를 기록할 채널")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub.setName("status").setDescription("현재 감사 로그 설정을 확인합니다.")
      ),
    handle: async (interaction: ChatInputCommandInteraction, context: AppContext) => {
      const guildId = interaction.guildId!;
      const prisma = context.db;
      const sub = interaction.options.getSubcommand();

      const settings = await prisma.guild_settings.findUnique({
        where: { guild_id: guildId },
      });

      if (sub === "status") {
        const status = settings?.audit_enabled ? "활성화" : "비활성화";
        const channel = settings?.log_channel_id ? `<#${settings.log_channel_id}>` : "미설정";
        await interaction.reply({
          content: `**감사 로그 상태**\n상태: ${status}\n채널: ${channel}`,
          ephemeral: true,
        });
        return;
      }

      if (sub === "on") {
        if (!settings?.log_channel_id) {
          await interaction.reply({
            content: "먼저 `/audit channel` 명령어로 로그 채널을 설정해주세요.",
            ephemeral: true,
          });
          return;
        }

        const channel = interaction.guild?.channels.cache.get(settings.log_channel_id);
        if (!channel || channel.type !== ChannelType.GuildText) {
          await interaction.reply({
            content: "설정된 로그 채널에 접근할 수 없습니다. 채널을 다시 설정해주세요.",
            ephemeral: true,
          });
          return;
        }

        const botMember = interaction.guild?.members.me;
        const permissions = channel.permissionsFor(botMember!);
        if (!permissions?.has("SendMessages") || !permissions?.has("EmbedLinks")) {
          await interaction.reply({
            content: "봇이 해당 채널에 메시지를 보낼 권한이 없습니다. 채널 권한을 확인해주세요.",
            ephemeral: true,
          });
          return;
        }

        await prisma.guild_settings.upsert({
          where: { guild_id: guildId },
          create: { guild_id: guildId, audit_enabled: true, log_channel_id: settings.log_channel_id },
          update: { audit_enabled: true },
        });

        await interaction.reply({ content: "감사 로그가 활성화되었습니다.", ephemeral: true });
        return;
      }

      if (sub === "off") {
        await prisma.guild_settings.upsert({
          where: { guild_id: guildId },
          create: { guild_id: guildId, audit_enabled: false },
          update: { audit_enabled: false },
        });

        await interaction.reply({ content: "감사 로그가 비활성화되었습니다.", ephemeral: true });
        return;
      }

      if (sub === "channel") {
        const channelOption = interaction.options.getChannel("channel", true);
        if (channelOption.type !== ChannelType.GuildText) {
          await interaction.reply({ content: "텍스트 채널만 설정할 수 있습니다.", ephemeral: true });
          return;
        }

        const channel = interaction.guild?.channels.cache.get(channelOption.id);
        if (!channel || channel.type !== ChannelType.GuildText) {
          await interaction.reply({ content: "채널을 찾을 수 없습니다.", ephemeral: true });
          return;
        }

        const botMember = interaction.guild?.members.me;
        const permissions = channel.permissionsFor(botMember!);
        if (!permissions?.has("SendMessages") || !permissions?.has("EmbedLinks")) {
          await interaction.reply({
            content: "봇이 해당 채널에 메시지를 보낼 권한이 없습니다. 채널 권한을 확인해주세요.",
            ephemeral: true,
          });
          return;
        }

        await prisma.guild_settings.upsert({
          where: { guild_id: guildId },
          create: { guild_id: guildId, log_channel_id: channel.id },
          update: { log_channel_id: channel.id },
        });

        await interaction.reply({
          content: `로그 채널이 <#${channel.id}>로 설정되었습니다.\n\`/audit on\` 명령어로 감사 로그를 활성화할 수 있습니다.`,
          ephemeral: true,
        });
        return;
      }
    },
  },
];

const auditModule: BotModule = {
  name: "audit",
  commands,
  register: (context: AppContext) => {
    const { client, logger } = context;

    client.on("voiceStateUpdate", async (oldState: VoiceState, newState: VoiceState) => {
      const guildId = newState.guild.id;
      if (oldState.channelId === newState.channelId) return;
      try {
        if (!oldState.channelId && newState.channelId) {
          await sendLog(
            context,
            guildId,
            "VOICE_JOIN",
            {
              actor_id: newState.id,
              channel_id: newState.channelId,
              target_id: newState.channelId,
            },
            () => `${newState.member?.displayName ?? "사용자"}가 음성 채널에 참가했습니다.`,
            { fields: [{ name: "Channel", value: `<#${newState.channelId}>` }] }
          );
        } else if (oldState.channelId && !newState.channelId) {
          await sendLog(
            context,
            guildId,
            "VOICE_LEAVE",
            {
              actor_id: oldState.id,
              channel_id: oldState.channelId,
              target_id: oldState.channelId,
            },
            () => `${oldState.member?.displayName ?? "사용자"}가 음성 채널을 떠났습니다.`,
            { fields: [{ name: "Channel", value: `<#${oldState.channelId}>` }] }
          );
        }
      } catch (error) {
        logger.warn({ err: error }, "Voice audit failed");
      }
    });

    client.on("messageDelete", async (message: Message | PartialMessage) => {
      if (!message.guild || message.author?.bot) return;
      try {
        const attachments = message.attachments?.map((a) => ({
          name: a.name,
          url: a.url,
          contentType: a.contentType,
        })) ?? [];

        const imageAttachment = message.attachments?.find((a) =>
          a.contentType?.startsWith("image/")
        );

        const fields = [
          { name: "User", value: message.author ? displayUser(message.author) : "Unknown" },
          { name: "Channel", value: `<#${message.channelId}>` },
        ];

        if (message.content) {
          fields.push({ name: "Content", value: message.content.slice(0, 1024) });
        }

        if (attachments.length > 0) {
          const attachmentList = attachments
            .map((a) => `[${a.name}](${a.url})`)
            .join("\n")
            .slice(0, 1024);
          fields.push({ name: "Attachments", value: attachmentList });
        }

        await sendLog(
          context,
          message.guild.id,
          "MESSAGE_DELETE",
          {
            actor_id: message.author?.id ?? "unknown",
            channel_id: message.channelId,
            target_id: message.id,
            content: message.content ?? "N/A",
            attachments,
          },
          () => `메시지가 삭제되었습니다.`,
          {
            fields,
            imageUrl: imageAttachment?.url,
          }
        );
      } catch (error) {
        logger.warn({ err: error }, "Message delete audit failed");
      }
    });

    client.on("messageUpdate", async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
      if (!newMessage.guild || newMessage.author?.bot) return;
      if (oldMessage.content === newMessage.content) return;
      try {
        await sendLog(
          context,
          newMessage.guild.id,
          "MESSAGE_EDIT",
          {
            actor_id: newMessage.author?.id ?? "unknown",
            channel_id: newMessage.channelId,
            target_id: newMessage.id,
            before: oldMessage.content ?? "N/A",
            after: newMessage.content ?? "N/A",
          },
          () => `메시지가 수정되었습니다.`,
          {
            fields: [
              { name: "User", value: newMessage.author ? displayUser(newMessage.author) : "Unknown" },
              { name: "Channel", value: `<#${newMessage.channelId}>` },
              { name: "Before", value: (oldMessage.content ?? "N/A").slice(0, 1024) },
              { name: "After", value: (newMessage.content ?? "N/A").slice(0, 1024) },
            ],
          }
        );
      } catch (error) {
        logger.warn({ err: error }, "Message edit audit failed");
      }
    });

    client.on("guildMemberAdd", async (member: GuildMember) => {
      try {
        await sendLog(
          context,
          member.guild.id,
          "MEMBER_JOIN",
          { actor_id: member.id, channel_id: null, target_id: member.id },
          () => `${member.displayName} 입장`
        );
      } catch (error) {
        logger.warn({ err: error }, "Member join audit failed");
      }
    });

    client.on("guildMemberRemove", async (member: GuildMember | PartialGuildMember) => {
      try {
        await sendLog(
          context,
          member.guild.id,
          "MEMBER_LEAVE",
          { actor_id: member.id, channel_id: null, target_id: member.id },
          () => `${member.displayName ?? "사용자"} 퇴장`
        );
      } catch (error) {
        logger.warn({ err: error }, "Member leave audit failed");
      }
    });

    client.on("guildMemberUpdate", async (oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
      try {
        const oldRoles = new Set(oldMember.roles.cache.keys());
        const newRoles = new Set(newMember.roles.cache.keys());
        for (const roleId of newRoles) {
          if (!oldRoles.has(roleId)) {
            await sendLog(
              context,
              newMember.guild.id,
              "ROLE_GRANTED",
              {
                actor_id: newMember.id,
                channel_id: null,
                target_id: roleId,
              },
              () => `${newMember.displayName}에게 역할이 부여됨`,
              { fields: [{ name: "Role", value: `<@&${roleId}>` }] }
            );
          }
        }
        for (const roleId of oldRoles) {
          if (!newRoles.has(roleId)) {
            await sendLog(
              context,
              newMember.guild.id,
              "ROLE_REVOKED",
              {
                actor_id: newMember.id,
                channel_id: null,
                target_id: roleId,
              },
              () => `${newMember.displayName}의 역할이 제거됨`,
              { fields: [{ name: "Role", value: `<@&${roleId}>` }] }
            );
          }
        }
      } catch (error) {
        logger.warn({ err: error }, "Role change audit failed");
      }
    });
  },
};

export default auditModule;
