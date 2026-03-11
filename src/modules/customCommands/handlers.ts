import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { AppContext } from "../../types.js";
import { validateCommandName, validateResponse } from "./validator.js";
import { reloadCustomCommands } from "./reloader.js";

export async function handleAddCommand(
  interaction: ChatInputCommandInteraction,
  context: AppContext
) {
  const guildId = interaction.guildId!;
  const name = interaction.options.getString("name", true).toLowerCase();
  const response = interaction.options.getString("response", true);

  // 1. 검증
  const nameValidation = validateCommandName(name);
  if (!nameValidation.valid) {
    await interaction.reply({ content: nameValidation.error, ephemeral: true });
    return;
  }

  const responseValidation = validateResponse(response);
  if (!responseValidation.valid) {
    await interaction.reply({ content: responseValidation.error, ephemeral: true });
    return;
  }

  // 2. 중복 검사
  const existing = await context.db.custom_commands.findUnique({
    where: { guild_id_name: { guild_id: guildId, name } },
  });
  if (existing) {
    await interaction.reply({
      content: `'/${name}' 명령어가 이미 존재합니다. 삭제 후 다시 추가하거나 다른 이름을 사용해주세요.`,
      ephemeral: true,
    });
    return;
  }

  // 먼저 응답을 예약하여 시간 확보
  await interaction.deferReply({ ephemeral: true });

  // 3. DB에 저장
  try {
    await context.db.custom_commands.create({
      data: {
        guild_id: guildId,
        name,
        response,
        created_by: interaction.user.id,
      },
    });

    // 4. Discord API 재등록
    await reloadCustomCommands(context);

    // 5. 감사 로그 기록
    await context.db.audit_events.create({
      data: {
        guild_id: guildId,
        event_type: "CUSTOM_COMMAND_ADDED",
        actor_id: interaction.user.id,
        channel_id: interaction.channelId,
        target_id: null,
        details: { name, response: response.slice(0, 100) },
      },
    });

    await interaction.editReply({
      content: `커스텀 명령어 \`/${name}\`이(가) 추가되었습니다.\n이제 \`/${name}\` 명령어를 사용할 수 있습니다.`,
    });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to add custom command");
    await interaction.editReply({
      content: "커스텀 명령어 추가 중 오류가 발생했습니다.",
    });
  }
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
          const preview = cmd.response.slice(0, 50);
          const truncated = cmd.response.length > 50 ? "..." : "";
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
