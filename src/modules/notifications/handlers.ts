import { ChatInputCommandInteraction, ChannelType, TextChannel } from "discord.js";
import { AppContext } from "../../types.js";
import { createSendModal, createEditModal } from "./modals.js";

export async function handleSend(
  interaction: ChatInputCommandInteraction,
  context: AppContext
) {
  // notification_channel_id 확인
  const settings = await context.db.guild_settings.findUnique({
    where: { guild_id: interaction.guildId! },
  });

  if (!settings?.notification_channel_id) {
    await interaction.reply({
      content: "공지사항 채널이 설정되지 않았습니다. `/config set notification_channel`을 먼저 실행해주세요.",
      ephemeral: true,
    });
    return;
  }

  // Modal 표시
  const modal = createSendModal();
  await interaction.showModal(modal);
}

export async function handleEdit(
  interaction: ChatInputCommandInteraction,
  context: AppContext
) {
  const messageId = interaction.options.getString("message_id", true);

  // 메시지 ID 검증 (숫자만 허용)
  if (!/^\d+$/.test(messageId)) {
    await interaction.reply({
      content: "올바른 메시지 ID를 입력해주세요.",
      ephemeral: true,
    });
    return;
  }

  try {
    // notification_channel_id 확인
    const settings = await context.db.guild_settings.findUnique({
      where: { guild_id: interaction.guildId! },
    });

    if (!settings?.notification_channel_id) {
      await interaction.reply({
        content: "공지사항 채널이 설정되지 않았습니다.",
        ephemeral: true,
      });
      return;
    }

    // 채널 및 메시지 가져오기
    const channel = await context.client.channels.fetch(settings.notification_channel_id);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "공지사항 채널을 찾을 수 없습니다.",
        ephemeral: true,
      });
      return;
    }

    const message = await (channel as TextChannel).messages.fetch(messageId);
    if (!message) {
      await interaction.reply({
        content: "메시지를 찾을 수 없습니다.",
        ephemeral: true,
      });
      return;
    }

    // content에서 제목과 내용 파싱
    const messageContent = message.content;
    if (!messageContent) {
      await interaction.reply({
        content: "공지사항 형식이 올바르지 않습니다.",
        ephemeral: true,
      });
      return;
    }

    // 형식: **제목**\n\n내용
    const titleMatch = messageContent.match(/^\*\*(.+?)\*\*/);
    const currentTitle = titleMatch ? titleMatch[1] : "";

    // 제목 이후의 내용 추출
    const currentContent = messageContent.replace(/^\*\*(.+?)\*\*\n\n/, "").trim();

    // Modal 표시
    const modal = createEditModal(messageId, currentTitle, currentContent);
    await interaction.showModal(modal);
  } catch (error) {
    context.logger.error({ err: error }, "Failed to prepare edit modal");
    await interaction.reply({
      content: "공지사항 조회 중 오류가 발생했습니다. 메시지 ID가 올바른지 확인해주세요.",
      ephemeral: true,
    });
  }
}

export async function handleRemove(
  interaction: ChatInputCommandInteraction,
  context: AppContext
) {
  const messageId = interaction.options.getString("message_id", true);

  // 메시지 ID 검증 (숫자만 허용)
  if (!/^\d+$/.test(messageId)) {
    await interaction.reply({
      content: "올바른 메시지 ID를 입력해주세요.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const guildId = interaction.guildId!;

    // notification_channel_id 확인
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

    // 메시지 삭제
    await message.delete();

    // 감사 로그 기록
    await context.db.audit_events.create({
      data: {
        guild_id: guildId,
        event_type: "NOTIFICATION_REMOVED",
        actor_id: interaction.user.id,
        channel_id: interaction.channelId,
        target_id: messageId,
        details: { message_id: messageId },
      },
    });

    await interaction.editReply({
      content: "공지사항이 삭제되었습니다.",
    });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to remove notification");
    await interaction.editReply({
      content: "공지사항 삭제 중 오류가 발생했습니다. 메시지 ID가 올바른지 확인해주세요.",
    });
  }
}
