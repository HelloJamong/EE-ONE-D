import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from "discord.js";
import { AppContext } from "../../types.js";
import { validateCommandName, validateResponse, validateDescription } from "./validator.js";
import { reloadCustomCommands } from "./reloader.js";

export function createAddModal() {
  return new ModalBuilder()
    .setCustomId("cmd_add_modal")
    .setTitle("커스텀 명령어 추가")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("명령어 이름 (소문자, 숫자, _, - 만 사용)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(32)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("미리보기 설명 (최대 100자, 선택사항)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("response")
          .setLabel("응답 내용 (최대 4000자, |||로 랜덤 응답 구분)")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setRequired(true)
      )
    );
}

export function createEditModal(name: string, currentDescription: string, currentResponse: string) {
  return new ModalBuilder()
    .setCustomId(`cmd_edit_modal:${name}`)
    .setTitle("커스텀 명령어 수정")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("미리보기 설명 (최대 100자, 비우면 미변경)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setValue(currentDescription || "")
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("response")
          .setLabel("응답 내용 (최대 4000자, 비우면 미변경)")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setValue(currentResponse)
          .setRequired(false)
      )
    );
}

export async function handleAddModal(
  interaction: ModalSubmitInteraction,
  context: AppContext
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const guildId = interaction.guildId!;
    const name = interaction.fields.getTextInputValue("name").toLowerCase().trim();
    const description = interaction.fields.getTextInputValue("description").trim() || null;
    const response = interaction.fields.getTextInputValue("response");

    // 1. 검증
    const nameValidation = validateCommandName(name);
    if (!nameValidation.valid) {
      await interaction.editReply({ content: nameValidation.error });
      return;
    }

    const responseValidation = validateResponse(response);
    if (!responseValidation.valid) {
      await interaction.editReply({ content: responseValidation.error });
      return;
    }

    const descriptionValidation = validateDescription(description);
    if (!descriptionValidation.valid) {
      await interaction.editReply({ content: descriptionValidation.error });
      return;
    }

    // 2. 중복 검사
    const existing = await context.db.custom_commands.findUnique({
      where: { guild_id_name: { guild_id: guildId, name } },
    });
    if (existing) {
      await interaction.editReply({
        content: `'/${name}' 명령어가 이미 존재합니다. 삭제 후 다시 추가하거나 다른 이름을 사용해주세요.`,
      });
      return;
    }

    // 3. DB에 저장
    await context.db.custom_commands.create({
      data: {
        guild_id: guildId,
        name,
        description,
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

export async function handleEditModal(
  interaction: ModalSubmitInteraction,
  context: AppContext
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const guildId = interaction.guildId!;
    const name = interaction.customId.split(":")[1];
    const newDescription = interaction.fields.getTextInputValue("description").trim();
    const newResponse = interaction.fields.getTextInputValue("response").trim();

    // 1. 최소 하나는 입력해야 함
    if (!newResponse && !newDescription) {
      await interaction.editReply({
        content: "수정할 내용을 입력해주세요. (response 또는 description 중 최소 하나)",
      });
      return;
    }

    // 2. 검증
    if (newResponse) {
      const responseValidation = validateResponse(newResponse);
      if (!responseValidation.valid) {
        await interaction.editReply({ content: responseValidation.error });
        return;
      }
    }

    if (newDescription) {
      const descriptionValidation = validateDescription(newDescription);
      if (!descriptionValidation.valid) {
        await interaction.editReply({ content: descriptionValidation.error });
        return;
      }
    }

    // 3. 존재 여부 확인
    const existing = await context.db.custom_commands.findUnique({
      where: { guild_id_name: { guild_id: guildId, name } },
    });

    if (!existing) {
      await interaction.editReply({
        content: `'/${name}' 명령어를 찾을 수 없습니다.`,
      });
      return;
    }

    // 4. DB 업데이트
    const updateData: { response?: string; description?: string | null } = {};
    if (newResponse) updateData.response = newResponse;
    if (newDescription) updateData.description = newDescription;

    await context.db.custom_commands.update({
      where: { guild_id_name: { guild_id: guildId, name } },
      data: updateData,
    });

    // 5. Discord API 재등록
    await reloadCustomCommands(context);

    // 6. 감사 로그 기록
    await context.db.audit_events.create({
      data: {
        guild_id: guildId,
        event_type: "CUSTOM_COMMAND_EDITED",
        actor_id: interaction.user.id,
        channel_id: interaction.channelId,
        target_id: null,
        details: {
          name,
          updated_response: !!newResponse,
          updated_description: !!newDescription,
        },
      },
    });

    const updatedFields = [];
    if (newResponse) updatedFields.push("응답");
    if (newDescription) updatedFields.push("미리보기");

    await interaction.editReply({
      content: `커스텀 명령어 \`/${name}\`의 ${updatedFields.join(", ")}이(가) 수정되었습니다.`,
    });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to edit custom command");
    await interaction.editReply({
      content: "커스텀 명령어 수정 중 오류가 발생했습니다.",
    });
  }
}
