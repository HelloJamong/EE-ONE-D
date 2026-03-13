import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} from "discord.js";
import { BotModule, AppContext } from "../../types.js";

const BUTTON_PREFIX = "welcome";

function ensureAdministrator(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has("Administrator")) {
    throw new Error("Administrator 권한이 필요합니다.");
  }
}

function parseEmoji(input: string): { id?: string; name?: string } | null {
  if (!input || input.trim() === '') return null;

  // 커스텀 이모지: <:name:id> 또는 <a:name:id>
  const customMatch = input.match(/<?a?:(\w+):(\d+)>?/);
  if (customMatch) {
    return { id: customMatch[2], name: customMatch[1] };
  }

  // 유니코드 이모지 검증 (간단한 체크)
  // 이모지는 일반적으로 특수 유니코드 문자이므로, 일반 텍스트와 구분
  const emojiRegex = /^[\p{Emoji}\p{Emoji_Component}]+$/u;
  if (emojiRegex.test(input.trim())) {
    return { name: input.trim() };
  }

  // 유효하지 않은 입력
  return null;
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("welcome")
      .setDescription("웰컴 메시지를 관리합니다.")
      .addSubcommand((sub) =>
        sub
          .setName("setup")
          .setDescription("웰컴 메시지를 설정합니다.")
          .addRoleOption((opt) =>
            opt
              .setName("role1")
              .setDescription("버튼 클릭 시 부여할 역할 1")
              .setRequired(true)
          )
          .addRoleOption((opt) =>
            opt
              .setName("role2")
              .setDescription("버튼 클릭 시 부여할 역할 2 (선택)")
              .setRequired(false)
          )
          .addRoleOption((opt) =>
            opt
              .setName("role3")
              .setDescription("버튼 클릭 시 부여할 역할 3 (선택)")
              .setRequired(false)
          )
          .addRoleOption((opt) =>
            opt
              .setName("role4")
              .setDescription("버튼 클릭 시 부여할 역할 4 (선택)")
              .setRequired(false)
          )
          .addRoleOption((opt) =>
            opt
              .setName("role5")
              .setDescription("버튼 클릭 시 부여할 역할 5 (선택)")
              .setRequired(false)
          )
      )
      .addSubcommand((sub) =>
        sub.setName("edit").setDescription("웰컴 메시지를 수정합니다.")
      )
      .addSubcommand((sub) =>
        sub.setName("remove").setDescription("웰컴 메시지를 삭제합니다.")
      ),
    handle: async (interaction: ChatInputCommandInteraction, context: AppContext) => {
      try {
        ensureAdministrator(interaction);
      } catch (error) {
        await interaction.reply({ content: (error as Error).message, ephemeral: true });
        return;
      }

      const settings = await context.db.guild_settings.findUnique({
        where: { guild_id: interaction.guildId! },
      });

      if (settings?.admin_config_channel_id && interaction.channelId !== settings.admin_config_channel_id) {
        await interaction.reply({
          content: "이 명령어는 지정된 관리자 채널에서만 사용할 수 있습니다.",
          ephemeral: true,
        });
        return;
      }

      const sub = interaction.options.getSubcommand();

      if (sub === "setup") {
        const roleIds: string[] = [];
        for (let i = 1; i <= 5; i++) {
          const role = interaction.options.getRole(`role${i}`, i === 1);
          if (role) roleIds.push(role.id);
        }

        if (roleIds.length === 0) {
          await interaction.reply({ content: "최소 1개 이상의 역할을 지정해야 합니다.", ephemeral: true });
          return;
        }

        // Modal 표시
        const modal = new ModalBuilder()
          .setCustomId(`welcome_setup:${roleIds.join(",")}`)
          .setTitle("웰컴 메시지 설정");

        const titleInput = new TextInputBuilder()
          .setCustomId("title")
          .setLabel("제목")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(256)
          .setRequired(true);

        const contentInput = new TextInputBuilder()
          .setCustomId("content")
          .setLabel("내용")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setRequired(true);

        const buttonEmojiInput = new TextInputBuilder()
          .setCustomId("button_emoji")
          .setLabel("버튼 이모지 (선택사항)")
          .setPlaceholder("예: 👍 또는 <:emoji:123456789>")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const buttonLabelInput = new TextInputBuilder()
          .setCustomId("button_label")
          .setLabel("버튼 레이블")
          .setPlaceholder("예: 규칙에 동의합니다")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(80)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(buttonEmojiInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(buttonLabelInput)
        );

        await interaction.showModal(modal);
        return;
      }

      if (sub === "edit") {
        const existing = await context.db.welcome_message.findUnique({
          where: { guild_id: interaction.guildId! },
        });

        if (!existing) {
          await interaction.reply({ content: "설정된 웰컴 메시지가 없습니다.", ephemeral: true });
          return;
        }

        // Modal 표시 (기존 값 채우기)
        const modal = new ModalBuilder()
          .setCustomId(`welcome_edit:${existing.role_ids.join(",")}`)
          .setTitle("웰컴 메시지 수정");

        const titleInput = new TextInputBuilder()
          .setCustomId("title")
          .setLabel("제목")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(256)
          .setValue(existing.title)
          .setRequired(true);

        const contentInput = new TextInputBuilder()
          .setCustomId("content")
          .setLabel("내용")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setValue(existing.content)
          .setRequired(true);

        const buttonEmojiInput = new TextInputBuilder()
          .setCustomId("button_emoji")
          .setLabel("버튼 이모지 (선택사항)")
          .setPlaceholder("예: 👍 또는 <:emoji:123456789>")
          .setStyle(TextInputStyle.Short)
          .setValue(existing.button_emoji || "")
          .setRequired(false);

        const buttonLabelInput = new TextInputBuilder()
          .setCustomId("button_label")
          .setLabel("버튼 레이블")
          .setPlaceholder("예: 규칙에 동의합니다")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(80)
          .setValue(existing.button_label)
          .setRequired(true);

        const rolesInput = new TextInputBuilder()
          .setCustomId("role_ids")
          .setLabel("역할 ID (쉼표로 구분)")
          .setPlaceholder("예: 123456789, 987654321")
          .setStyle(TextInputStyle.Short)
          .setValue(existing.role_ids.join(", "))
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(buttonEmojiInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(buttonLabelInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(rolesInput)
        );

        await interaction.showModal(modal);
        return;
      }

      if (sub === "remove") {
        const existing = await context.db.welcome_message.findUnique({
          where: { guild_id: interaction.guildId! },
        });

        if (!existing) {
          await interaction.reply({ content: "설정된 웰컴 메시지가 없습니다.", ephemeral: true });
          return;
        }

        // 메시지 삭제 시도
        if (existing.message_id) {
          try {
            const channel = interaction.guild?.channels.cache.get(existing.channel_id);
            if (channel?.type === ChannelType.GuildText) {
              const message = await channel.messages.fetch(existing.message_id);
              await message.delete();
            }
          } catch (error) {
            context.logger.warn({ err: error }, "Failed to delete welcome message");
          }
        }

        await context.db.welcome_message.delete({
          where: { guild_id: interaction.guildId! },
        });

        await interaction.reply({ content: "웰컴 메시지를 삭제했습니다.", ephemeral: true });
        return;
      }
    },
  },
];

async function handleModalSubmit(interaction: ModalSubmitInteraction, context: AppContext) {
  const [prefix, roleIdsStr] = interaction.customId.split(":");
  if ((prefix !== "welcome_setup" && prefix !== "welcome_edit") || !roleIdsStr) return;

  const title = interaction.fields.getTextInputValue("title");
  const content = interaction.fields.getTextInputValue("content");
  const buttonEmojiInput = interaction.fields.getTextInputValue("button_emoji") || null;
  const buttonLabel = interaction.fields.getTextInputValue("button_label");

  // edit 모드에서는 role_ids를 Modal에서 받음
  let roleIds: string[];
  if (prefix === "welcome_edit") {
    const roleIdsInput = interaction.fields.getTextInputValue("role_ids");
    roleIds = roleIdsInput
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (roleIds.length === 0) {
      await interaction.reply({
        content: "최소 1개 이상의 역할 ID를 지정해야 합니다.",
        ephemeral: true,
      });
      return;
    }
  } else {
    roleIds = roleIdsStr.split(",");
  }

  const settings = await context.db.guild_settings.findUnique({
    where: { guild_id: interaction.guildId! },
  });

  if (!settings?.welcome_channel_id) {
    await interaction.reply({
      content: "웰컴 채널이 설정되지 않았습니다. `/config set welcome_channel` 명령어로 먼저 설정해주세요.",
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.guild?.channels.cache.get(settings.welcome_channel_id);
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "웰컴 채널을 찾을 수 없습니다.",
      ephemeral: true,
    });
    return;
  }

  // Embed 생성
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(content)
    .setColor(0x5865f2);

  // 버튼 생성
  const button = new ButtonBuilder()
    .setCustomId(`${BUTTON_PREFIX}:${interaction.guildId!}`)
    .setStyle(ButtonStyle.Primary)
    .setLabel(buttonLabel);

  if (buttonEmojiInput) {
    const emoji = parseEmoji(buttonEmojiInput);
    if (emoji) {
      if (emoji.id) {
        button.setEmoji({ id: emoji.id, name: emoji.name });
      } else if (emoji.name) {
        button.setEmoji(emoji.name);
      }
    }
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  try {
    // 기존 메시지 확인
    const existing = await context.db.welcome_message.findUnique({
      where: { guild_id: interaction.guildId! },
    });

    let message;
    if (existing?.message_id) {
      // 기존 메시지 수정
      try {
        const existingMsg = await channel.messages.fetch(existing.message_id);
        message = await existingMsg.edit({ embeds: [embed], components: [row] });
      } catch (error) {
        context.logger.warn({ err: error }, "Failed to edit existing welcome message, creating new one");
        message = await channel.send({ embeds: [embed], components: [row] });
      }
    } else {
      // 새 메시지 발송
      message = await channel.send({ embeds: [embed], components: [row] });
    }

    // DB에 저장
    await context.db.welcome_message.upsert({
      where: { guild_id: interaction.guildId! },
      create: {
        guild_id: interaction.guildId!,
        channel_id: channel.id,
        message_id: message.id,
        title,
        content,
        button_emoji: buttonEmojiInput,
        button_label: buttonLabel,
        role_ids: roleIds,
      },
      update: {
        channel_id: channel.id,
        message_id: message.id,
        title,
        content,
        button_emoji: buttonEmojiInput,
        button_label: buttonLabel,
        role_ids: roleIds,
      },
    });

    const rolesMention = roleIds.map((id) => `<@&${id}>`).join(", ");
    await interaction.reply({
      content: `웰컴 메시지를 ${prefix === "welcome_edit" ? "수정" : "설정"}했습니다.\n채널: <#${channel.id}>\n역할: ${rolesMention}`,
      ephemeral: true,
    });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to send welcome message");
    await interaction.reply({
      content: "웰컴 메시지 발송 중 오류가 발생했습니다.",
      ephemeral: true,
    });
  }
}

async function handleButton(interaction: ButtonInteraction, context: AppContext) {
  const [prefix, guildId] = interaction.customId.split(":");
  if (prefix !== BUTTON_PREFIX || !guildId) return;

  const welcomeMsg = await context.db.welcome_message.findUnique({
    where: { guild_id: guildId },
  });

  if (!welcomeMsg) {
    await interaction.reply({
      content: "웰컴 메시지 설정을 찾을 수 없습니다.",
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member as GuildMember;

  // 모든 역할이 이미 있는지 확인
  const hasAllRoles = welcomeMsg.role_ids.every((roleId) => member.roles.cache.has(roleId));

  if (hasAllRoles) {
    await interaction.reply({
      content: "이미 인증되었습니다.",
      ephemeral: true,
    });
    return;
  }

  // 존재하는 역할만 필터링
  const validRoles = welcomeMsg.role_ids.filter((roleId) => {
    return interaction.guild!.roles.cache.has(roleId);
  });

  if (validRoles.length === 0) {
    await interaction.reply({
      content: "부여할 역할을 찾을 수 없습니다.",
      ephemeral: true,
    });
    return;
  }

  try {
    // 여러 역할 한 번에 부여
    await member.roles.add(validRoles);

    const roleNames = validRoles
      .map((roleId) => interaction.guild!.roles.cache.get(roleId)?.name)
      .filter(Boolean)
      .join(", ");

    await interaction.reply({
      content: `${roleNames} 역할이 부여되었습니다. 서버에 오신 것을 환영합니다!`,
      ephemeral: true,
    });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to assign welcome roles");
    await interaction.reply({
      content: "역할을 부여하지 못했습니다.",
      ephemeral: true,
    });
  }
}

const welcomeModule: BotModule = {
  name: "welcome",
  commands,
  register: (context) => {
    context.client.on("interactionCreate", async (interaction) => {
      if (interaction.isModalSubmit() &&
          (interaction.customId.startsWith("welcome_setup:") || interaction.customId.startsWith("welcome_edit:"))) {
        await handleModalSubmit(interaction, context);
      }
      if (interaction.isButton() && interaction.customId.startsWith(BUTTON_PREFIX)) {
        await handleButton(interaction, context);
      }
    });
  },
};

export default welcomeModule;
