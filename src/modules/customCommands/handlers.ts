import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { AppContext } from "../../types.js";
import { reloadCustomCommands } from "./reloader.js";
import { createAddModal, createEditModal } from "./modals.js";

export async function handleAddCommand(
  interaction: ChatInputCommandInteraction,
  context: AppContext
) {
  // Modal 표시
  const modal = createAddModal();
  await interaction.showModal(modal);
}

export async function handleEditCommand(
  interaction: ChatInputCommandInteraction,
  context: AppContext
) {
  const guildId = interaction.guildId!;
  const name = interaction.options.getString("name", true).toLowerCase();

  // 존재 여부 확인
  const existing = await context.db.custom_commands.findUnique({
    where: { guild_id_name: { guild_id: guildId, name } },
  });

  if (!existing) {
    await interaction.reply({
      content: `'/${name}' 명령어를 찾을 수 없습니다.`,
      ephemeral: true,
    });
    return;
  }

  // Modal 표시 (현재 값 미리 채우기)
  const modal = createEditModal(name, existing.description || "", existing.response);
  await interaction.showModal(modal);
}

export async function handleRemoveCommand(
  interaction: ChatInputCommandInteraction,
  context: AppContext
) {
  const guildId = interaction.guildId!;
  const name = interaction.options.getString("name", true).toLowerCase();

  const existing = await context.db.custom_commands.findUnique({
    where: { guild_id_name: { guild_id: guildId, name } },
  });

  if (!existing) {
    await interaction.reply({
      content: `'/${name}' 명령어를 찾을 수 없습니다.`,
      ephemeral: true,
    });
    return;
  }

  // 먼저 응답을 예약하여 시간 확보
  await interaction.deferReply({ ephemeral: true });

  try {
    await context.db.custom_commands.delete({
      where: { guild_id_name: { guild_id: guildId, name } },
    });

    await reloadCustomCommands(context);

    await context.db.audit_events.create({
      data: {
        guild_id: guildId,
        event_type: "CUSTOM_COMMAND_REMOVED",
        actor_id: interaction.user.id,
        channel_id: interaction.channelId,
        target_id: null,
        details: { name },
      },
    });

    await interaction.editReply({
      content: `커스텀 명령어 \`/${name}\`이(가) 삭제되었습니다.`,
    });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to remove custom command");
    await interaction.editReply({
      content: "커스텀 명령어 삭제 중 오류가 발생했습니다.",
    });
  }
}

export async function handleListCommand(
  interaction: ChatInputCommandInteraction,
  context: AppContext
) {
  const guildId = interaction.guildId!;
  const customCmds = await context.db.custom_commands.findMany({
    where: { guild_id: guildId },
    orderBy: { created_at: "desc" },
  });

  if (customCmds.length === 0) {
    await interaction.reply({
      content: "등록된 커스텀 명령어가 없습니다.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("커스텀 명령어 목록")
    .setColor(0x5865f2)
    .setDescription(
      customCmds
        .slice(0, 25) // Discord embed 필드 제한
        .map((cmd, idx) => {
          const preview = cmd.description || cmd.response.slice(0, 50);
          const truncated = !cmd.description && cmd.response.length > 50 ? "..." : "";
          return `**${idx + 1}. /${cmd.name}**\n${preview}${truncated}\n생성자: <@${cmd.created_by}>`;
        })
        .join("\n\n")
    )
    .setFooter({ text: `총 ${customCmds.length}개` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleReloadCommand(
  interaction: ChatInputCommandInteraction,
  context: AppContext
) {
  // 먼저 응답을 예약하여 시간 확보
  await interaction.deferReply({ ephemeral: true });

  try {
    await reloadCustomCommands(context);
    await interaction.editReply({
      content: "커스텀 명령어를 재등록했습니다.",
    });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to reload custom commands");
    await interaction.editReply({
      content: "커스텀 명령어 재등록 중 오류가 발생했습니다.",
    });
  }
}
