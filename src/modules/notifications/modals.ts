import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  ChannelType,
  TextChannel,
} from "discord.js";
import { AppContext } from "../../types.js";

async function parseMentions(content: string, guildId: string, context: AppContext): Promise<string> {
  let parsedContent = content;

  try {
    const guild = await context.client.guilds.fetch(guildId);

    // 역할 멘션 파싱: @역할이름 -> <@&역할ID>
    const roleMentions = content.matchAll(/@([^\s#@]+)/g);
    for (const match of roleMentions) {
      const roleName = match[1];
      // @everyone, @here는 그대로 유지
      if (roleName === 'everyone' || roleName === 'here') {
        continue;
      }
      const role = guild.roles.cache.find(r => r.name === roleName);
      if (role) {
        parsedContent = parsedContent.replace(new RegExp(`@${roleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), `<@&${role.id}>`);
      }
    }

    // 채널 멘션 파싱: #채널이름 -> <#채널ID>
    const channelMentions = content.matchAll(/#([^\s#@]+)/g);
    for (const match of channelMentions) {
      const channelName = match[1];
      const channel = guild.channels.cache.find(c => c.name === channelName);
      if (channel) {
        parsedContent = parsedContent.replace(new RegExp(`#${channelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), `<#${channel.id}>`);
      }
    }
  } catch (error) {
    context.logger.error({ err: error }, "Failed to parse mentions");
  }

  return parsedContent;
}

export function createSendModal() {
  return new ModalBuilder()
    .setCustomId("noti_send_modal")
    .setTitle("공지사항 작성")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("제목")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(256)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("content")
          .setLabel("내용")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setRequired(true)
      )
    );
}

export function createEditModal(messageId: string, currentTitle: string, currentContent: string) {
  return new ModalBuilder()
    .setCustomId(`noti_edit_modal:${messageId}`)
    .setTitle("공지사항 수정")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("제목")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(256)
          .setValue(currentTitle)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("content")
          .setLabel("내용")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setValue(currentContent)
          .setRequired(true)
      )
    );
}

export async function handleSendModal(
  interaction: ModalSubmitInteraction,
  context: AppContext
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const guildId = interaction.guildId!;
    const title = interaction.fields.getTextInputValue("title");
    const content = interaction.fields.getTextInputValue("content");

    // 공지사항 채널 확인
    const settings = await context.db.guild_settings.findUnique({
      where: { guild_id: guildId },
    });

    if (!settings?.notification_channel_id) {
      await interaction.editReply({
        content: "공지사항 채널이 설정되지 않았습니다. `/config set notification_channel`을 먼저 실행해주세요.",
      });
      return;
    }

    // 채널 가져오기
    const channel = await context.client.channels.fetch(settings.notification_channel_id);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply({
        content: "공지사항 채널을 찾을 수 없습니다. 채널 설정을 확인해주세요.",
      });
      return;
    }

    // 멘션 파싱
    const parsedContent = await parseMentions(content, guildId, context);

    // 공지사항 발송
    const formattedContent = `**${title}**\n\n${parsedContent}`;

    const message = await (channel as TextChannel).send({
      content: formattedContent,
      allowedMentions: { parse: ['users', 'roles', 'everyone'] }
    });

    // 감사 로그 기록
    await context.db.audit_events.create({
      data: {
        guild_id: guildId,
        event_type: "NOTIFICATION_SENT",
        actor_id: interaction.user.id,
        channel_id: interaction.channelId,
        target_id: message.id,
        details: { title, content: content.slice(0, 100) },
      },
    });

    await interaction.editReply({
      content: `공지사항이 <#${settings.notification_channel_id}>에 발송되었습니다.\n메시지 ID: ${message.id}`,
    });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to send notification");
    await interaction.editReply({
      content: "공지사항 발송 중 오류가 발생했습니다.",
    });
  }
}

export async function handleEditModal(
  interaction: ModalSubmitInteraction,
  context: AppContext
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const guildId = interaction.guildId!;
    const messageId = interaction.customId.split(":")[1];
    const title = interaction.fields.getTextInputValue("title");
    const content = interaction.fields.getTextInputValue("content");

    // 공지사항 채널 확인
    const settings = await context.db.guild_settings.findUnique({
      where: { guild_id: guildId },
    });

    if (!settings?.notification_channel_id) {
      await interaction.editReply({
        content: "공지사항 채널이 설정되지 않았습니다.",
      });
      return;
    }

    // 채널 및 메시지 가져오기
    const channel = await context.client.channels.fetch(settings.notification_channel_id);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply({
        content: "공지사항 채널을 찾을 수 없습니다.",
      });
      return;
    }

    const message = await (channel as TextChannel).messages.fetch(messageId);
    if (!message) {
      await interaction.editReply({
        content: "메시지를 찾을 수 없습니다.",
      });
      return;
    }

    // 멘션 파싱
    const parsedContent = await parseMentions(content, guildId, context);

    // 공지사항 수정
    const formattedContent = `**${title}**\n\n${parsedContent}`;

    await message.edit({
      content: formattedContent,
      allowedMentions: { parse: ['users', 'roles', 'everyone'] }
    });

    // 감사 로그 기록
    await context.db.audit_events.create({
      data: {
        guild_id: guildId,
        event_type: "NOTIFICATION_EDITED",
        actor_id: interaction.user.id,
        channel_id: interaction.channelId,
        target_id: message.id,
        details: { title, content: content.slice(0, 100) },
      },
    });

    await interaction.editReply({
      content: `공지사항이 수정되었습니다.`,
    });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to edit notification");
    await interaction.editReply({
      content: "공지사항 수정 중 오류가 발생했습니다. 메시지 ID가 올바른지 확인해주세요.",
    });
  }
}
