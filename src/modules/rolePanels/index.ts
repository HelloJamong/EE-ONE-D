import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  ModalBuilder,
  ModalSubmitInteraction,
  Role,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { BotModule, AppContext } from "../../types.js";
import { PanelMode } from "@prisma/client";

const BUTTON_PREFIX = "rp";

function isCustomEmoji(input: string) {
  const match = input.match(/<?a?:\w+:(\d+)>?/);
  return match?.[1];
}

async function ensureAdmin(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has("Administrator")) {
    throw new Error("Administrator 권한이 필요합니다.");
  }
}

async function ensureAdminChannel(interaction: ChatInputCommandInteraction, adminChannelId?: string) {
  if (adminChannelId && interaction.channelId !== adminChannelId) {
    throw new Error("관리자 설정 채널에서만 사용할 수 있습니다.");
  }
}

function buildPanelEmbed(panel: any, guild?: any) {
  let description = panel.description;

  // 길드 정보가 있으면 커스텀 이모지 자동 변환
  if (guild?.emojis?.cache) {
    // 이모지 이름 -> 정보 매핑 생성
    const emojiMap = new Map<string, { id: string; animated: boolean }>();
    guild.emojis.cache.forEach((emoji: any) => {
      if (emoji.name) {
        emojiMap.set(emoji.name, { id: emoji.id, animated: emoji.animated || false });
      }
    });

    // :emoji_name: 패턴을 <:emoji_name:emoji_id> 또는 <a:emoji_name:emoji_id>로 변환
    description = description.replace(/:(\w+):/g, (match: string, emojiName: string) => {
      const emoji = emojiMap.get(emojiName);
      if (emoji) {
        return emoji.animated ? `<a:${emojiName}:${emoji.id}>` : `<:${emojiName}:${emoji.id}>`;
      }
      return match; // 서버에 없는 이모지는 그대로 유지
    });
  }

  return new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(description)
    .setColor(0x5865f2);
}

function buildButtons(items: any[]) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const sorted = items.sort((a, b) => a.sort_order - b.sort_order);
  for (let i = 0; i < sorted.length; i += 5) {
    const slice = sorted.slice(i, i + 5);
    const row = new ActionRowBuilder<ButtonBuilder>();
    slice.forEach((item) => {
      const button = new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}:${item.panel_id}:${item.id}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ id: item.emoji_id });

      if (item.label) {
        button.setLabel(item.label);
      }

      row.addComponents(button);
    });
    rows.push(row);
    if (rows.length >= 5) break;
  }
  return rows;
}

async function handleButton(interaction: ButtonInteraction, context: AppContext) {
  const [prefix, panelId, itemId] = interaction.customId.split(":");
  if (prefix !== BUTTON_PREFIX || !panelId || !itemId) return;
  const prisma = context.db;
  const panel = await prisma.role_panels.findUnique({
    where: { id: panelId },
    include: { items: true, guild: true },
  });
  if (!panel || panel.guild_id !== interaction.guildId) return;

  const targetItem = panel.items.find((i) => i.id === itemId);
  if (!targetItem) {
    await interaction.reply({ content: "패널 항목을 찾을 수 없습니다.", ephemeral: true });
    return;
  }

  const member = interaction.member as GuildMember;
  const role = interaction.guild!.roles.cache.get(targetItem.role_id);
  if (!role) {
    await interaction.reply({ content: "역할을 찾을 수 없습니다.", ephemeral: true });
    return;
  }

  try {
    if (panel.mode === PanelMode.MULTI) {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        await interaction.reply({ content: `${role.name} 역할을 제거했습니다.`, ephemeral: true });
      } else {
        await member.roles.add(role);
        await interaction.reply({ content: `${role.name} 역할을 부여했습니다.`, ephemeral: true });
      }
    } else {
      if (member.roles.cache.has(role.id) && panel.allow_none) {
        await member.roles.remove(role);
        await interaction.reply({ content: `${role.name} 역할을 제거했습니다.`, ephemeral: true });
      } else {
        const otherRoles = panel.items.filter((i) => i.role_id !== role.id).map((i) => i.role_id);
        const existing = otherRoles.filter((id) => member.roles.cache.has(id));
        if (existing.length) {
          await member.roles.remove(existing);
        }
        await member.roles.add(role);
        await interaction.reply({ content: `${role.name} 역할을 부여했습니다.`, ephemeral: true });
      }
    }
  } catch (error) {
    context.logger.error({ err: error }, "Failed to toggle role");
    await interaction.reply({ content: "역할을 변경하지 못했습니다.", ephemeral: true });
  }
}

async function publishPanel(
  interaction: ChatInputCommandInteraction,
  panelId: string,
  context: AppContext
) {
  const prisma = context.db;
  const panel = await prisma.role_panels.findUnique({
    where: { id: panelId },
    include: { items: true, guild: true },
  });
  if (!panel) {
    await interaction.reply({ content: "패널을 찾을 수 없습니다.", ephemeral: true });
    return;
  }
  const channel =
    (interaction.options.getChannel("channel", false) as any) ??
    interaction.guild?.channels.cache.get(panel.published_channel_id ?? "");
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "게시할 텍스트 채널을 찾을 수 없습니다.", ephemeral: true });
    return;
  }

  const embed = buildPanelEmbed(panel, interaction.guild);
  const components = buildButtons(panel.items);

  try {
    if (panel.published_message_id) {
      const existing = await channel.messages.fetch(panel.published_message_id);
      await existing.edit({ embeds: [embed], components });
    } else {
      const sent = await channel.send({ embeds: [embed], components });
      await prisma.role_panels.update({
        where: { id: panelId },
        data: { published_channel_id: channel.id, published_message_id: sent.id },
      });
    }
    await interaction.reply({ content: "패널을 게시했습니다.", ephemeral: true });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to publish panel");
    await interaction.reply({ content: "패널 게시 중 오류가 발생했습니다.", ephemeral: true });
  }
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("panel")
      .setDescription("역할 패널을 관리합니다.")
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("새 패널을 생성하고 채널에 게시합니다.")
          .addStringOption((opt) =>
            opt.setName("name").setDescription("패널 이름").setRequired(true)
          )
          .addChannelOption((opt) =>
            opt
              .setName("channel")
              .setDescription("패널을 게시할 채널")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("패널에 역할 버튼을 추가합니다.")
          .addStringOption((opt) =>
            opt.setName("panel_id").setDescription("패널 ID").setRequired(true)
          )
          .addStringOption((opt) =>
            opt.setName("emoji").setDescription("커스텀 이모지").setRequired(true)
          )
          .addRoleOption((opt) => opt.setName("role").setDescription("역할").setRequired(true))
          .addStringOption((opt) =>
            opt.setName("label").setDescription("버튼 라벨 (미입력 시 이모지만 표시)").setRequired(false)
          )
          .addIntegerOption((opt) =>
            opt.setName("order").setDescription("정렬 순서").setRequired(false)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("패널에서 항목을 제거합니다.")
          .addStringOption((opt) =>
            opt.setName("panel_id").setDescription("패널 ID").setRequired(true)
          )
          .addStringOption((opt) =>
            opt.setName("emoji").setDescription("커스텀 이모지").setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("생성된 패널 목록을 조회합니다.")
      )
      .addSubcommand((sub) =>
        sub
          .setName("list_items")
          .setDescription("패널에 등록된 레이블 목록을 조회합니다.")
          .addStringOption((opt) =>
            opt.setName("panel_id").setDescription("패널 ID").setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("publish")
          .setDescription("패널 메시지를 게시하거나 갱신합니다.")
          .addStringOption((opt) =>
            opt.setName("panel_id").setDescription("패널 ID").setRequired(true)
          )
          .addChannelOption((opt) =>
            opt
              .setName("channel")
              .setDescription("게시할 채널 (미지정 시 이전 채널 사용)")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("set_message")
          .setDescription("기존 메시지를 패널과 연결합니다.")
          .addStringOption((opt) =>
            opt.setName("panel_id").setDescription("패널 ID").setRequired(true)
          )
          .addChannelOption((opt) =>
            opt
              .setName("channel")
              .setDescription("메시지가 있는 채널")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
          .addStringOption((opt) =>
            opt.setName("message_id").setDescription("메시지 ID").setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("edit")
          .setDescription("패널의 제목과 설명을 수정합니다.")
          .addStringOption((opt) =>
            opt.setName("panel_id").setDescription("패널 ID").setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("패널을 삭제합니다.")
          .addStringOption((opt) =>
            opt.setName("panel_id").setDescription("패널 ID").setRequired(true)
          )
          .addBooleanOption((opt) =>
            opt
              .setName("delete_message")
              .setDescription("게시된 메시지도 삭제 (기본: true)")
              .setRequired(false)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("edit_item")
          .setDescription("패널의 레이블을 수정합니다.")
          .addStringOption((opt) =>
            opt.setName("panel_id").setDescription("패널 ID").setRequired(true)
          )
          .addStringOption((opt) =>
            opt.setName("old_emoji").setDescription("수정할 레이블의 현재 이모지").setRequired(true)
          )
          .addStringOption((opt) =>
            opt.setName("new_emoji").setDescription("새 이모지 (선택)").setRequired(false)
          )
          .addRoleOption((opt) =>
            opt.setName("role").setDescription("새 역할 (선택)").setRequired(false)
          )
          .addStringOption((opt) =>
            opt.setName("label").setDescription("새 라벨 (선택)").setRequired(false)
          )
          .addIntegerOption((opt) =>
            opt.setName("order").setDescription("새 순서 (선택)").setRequired(false)
          )
      ),
    handle: async (interaction: ChatInputCommandInteraction, context: AppContext) => {
      const guildId = interaction.guildId!;
      const prisma = context.db;

      try {
        await ensureAdmin(interaction);
      } catch (error) {
        await interaction.reply({ content: (error as Error).message, ephemeral: true });
        return;
      }

      const settings = await prisma.guild_settings.findUnique({ where: { guild_id: guildId } });
      try {
        await ensureAdminChannel(interaction, settings?.admin_config_channel_id ?? undefined);
      } catch (error) {
        await interaction.reply({ content: (error as Error).message, ephemeral: true });
        return;
      }

      const sub = interaction.options.getSubcommand();

      if (sub === "create") {
        const name = interaction.options.getString("name", true);
        const channelOption = interaction.options.getChannel("channel", true);

        if (channelOption.type !== ChannelType.GuildText) {
          await interaction.reply({ content: "텍스트 채널만 사용할 수 있습니다.", ephemeral: true });
          return;
        }

        const channel = interaction.guild?.channels.cache.get(channelOption.id);
        if (!channel || channel.type !== ChannelType.GuildText) {
          await interaction.reply({ content: "채널을 찾을 수 없습니다.", ephemeral: true });
          return;
        }

        // 기본값으로 패널 생성
        const created = await prisma.role_panels.create({
          data: {
            guild_id: guildId,
            mode: PanelMode.MULTI,
            allow_none: true,
            title: name,
            description: "역할을 선택하세요.",
            created_by: interaction.user.id,
          },
        });

        // 즉시 빈 패널 게시
        try {
          const embed = buildPanelEmbed(created, interaction.guild);
          const sent = await channel.send({ embeds: [embed] });

          await prisma.role_panels.update({
            where: { id: created.id },
            data: { published_channel_id: channel.id, published_message_id: sent.id },
          });

          await interaction.reply({
            content: `패널 생성 완료!\nID: ${created.id}\n채널: <#${channel.id}>\n\n다음 단계:\n1. \`/panel edit\`로 제목/설명/모드 수정\n2. \`/panel add\`로 역할 추가`,
            ephemeral: true,
          });
        } catch (error) {
          context.logger.error({ err: error }, "Failed to publish new panel");
          await interaction.reply({ content: "패널 게시 중 오류가 발생했습니다.", ephemeral: true });
        }
        return;
      }

      if (sub === "add") {
        const panelId = interaction.options.getString("panel_id", true);
        const emojiInput = interaction.options.getString("emoji", true);
        const emojiId = isCustomEmoji(emojiInput);
        if (!emojiId) {
          await interaction.reply({ content: "커스텀 이모지만 사용할 수 있습니다.", ephemeral: true });
          return;
        }
        const role = interaction.options.getRole("role", true) as Role;
        const label = interaction.options.getString("label", false) || "";
        const order = interaction.options.getInteger("order") ?? 0;

        // 중복 확인
        const existingByEmoji = await prisma.role_panel_items.findFirst({
          where: { panel_id: panelId, emoji_id: emojiId },
        });
        if (existingByEmoji) {
          await interaction.reply({ content: "이미 해당 이모지를 사용하는 레이블이 존재합니다.", ephemeral: true });
          return;
        }

        const existingByRole = await prisma.role_panel_items.findFirst({
          where: { panel_id: panelId, role_id: role.id },
        });
        if (existingByRole) {
          await interaction.reply({ content: `이미 ${role.name} 역할이 패널에 추가되어 있습니다.`, ephemeral: true });
          return;
        }

        await prisma.role_panel_items.create({
          data: {
            panel_id: panelId,
            emoji_id: emojiId,
            role_id: role.id,
            label,
            sort_order: order,
          },
        });

        await interaction.reply({ content: "패널 항목을 추가했습니다. `/panel publish`로 변경사항을 적용하세요.", ephemeral: true });
        return;
      }

      if (sub === "remove") {
        const panelId = interaction.options.getString("panel_id", true);
        const emojiInput = interaction.options.getString("emoji", true);
        const emojiId = isCustomEmoji(emojiInput);
        if (!emojiId) {
          await interaction.reply({ content: "커스텀 이모지를 입력하세요.", ephemeral: true });
          return;
        }
        await prisma.role_panel_items.deleteMany({
          where: { panel_id: panelId, emoji_id: emojiId },
        });
        await interaction.reply({ content: "패널 항목을 제거했습니다.", ephemeral: true });
        return;
      }

      if (sub === "list") {
        const panels = await prisma.role_panels.findMany({
          where: { guild_id: guildId },
          orderBy: { created_at: "desc" },
        });
        if (!panels.length) {
          await interaction.reply({ content: "생성된 패널이 없습니다.", ephemeral: true });
          return;
        }
        const rows = panels
          .map((panel) => `**${panel.title}**\nID: \`${panel.id}\` | 모드: ${panel.mode} | 채널: ${panel.published_channel_id ? `<#${panel.published_channel_id}>` : "미게시"}`)
          .join("\n\n");
        await interaction.reply({ content: rows, ephemeral: true });
        return;
      }

      if (sub === "list_items") {
        const panelId = interaction.options.getString("panel_id", true);
        const items = await prisma.role_panel_items.findMany({
          where: { panel_id: panelId },
          orderBy: { sort_order: "asc" },
        });
        if (!items.length) {
          await interaction.reply({ content: "등록된 레이블이 없습니다.", ephemeral: true });
          return;
        }
        const rows = items
          .map((item) => `${item.label || "(레이블 없음)"} | emoji:${item.emoji_id} | role:<@&${item.role_id}> | order:${item.sort_order}`)
          .join("\n");
        await interaction.reply({ content: rows, ephemeral: true });
        return;
      }

      if (sub === "publish") {
        const panelId = interaction.options.getString("panel_id", true);
        await publishPanel(interaction, panelId, context);
        return;
      }

      if (sub === "set_message") {
        const panelId = interaction.options.getString("panel_id", true);
        const channelOption = interaction.options.getChannel("channel", true);
        const messageId = interaction.options.getString("message_id", true);
        if (channelOption.type !== ChannelType.GuildText) {
          await interaction.reply({ content: "텍스트 채널만 사용할 수 있습니다.", ephemeral: true });
          return;
        }
        const channel = interaction.guild?.channels.cache.get(channelOption.id);
        if (!channel || channel.type !== ChannelType.GuildText) {
          await interaction.reply({ content: "채널을 찾을 수 없습니다.", ephemeral: true });
          return;
        }
        try {
          const targetMsg = await channel.messages.fetch(messageId);
          if (!targetMsg) throw new Error("메시지를 찾지 못했습니다.");
          await prisma.role_panels.update({
            where: { id: panelId },
            data: { published_channel_id: channel.id, published_message_id: targetMsg.id },
          });
          await interaction.reply({ content: "패널 메시지를 등록했습니다.", ephemeral: true });
        } catch (error) {
          context.logger.error({ err: error }, "Failed to set panel message");
          await interaction.reply({ content: "메시지를 찾지 못했습니다.", ephemeral: true });
        }
        return;
      }

      if (sub === "edit") {
        const panelId = interaction.options.getString("panel_id", true);
        const panel = await prisma.role_panels.findUnique({ where: { id: panelId } });
        if (!panel) {
          await interaction.reply({ content: "패널을 찾을 수 없습니다.", ephemeral: true });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId(`panel_edit:${panelId}`)
          .setTitle("패널 수정");

        const titleInput = new TextInputBuilder()
          .setCustomId("title")
          .setLabel("제목")
          .setStyle(TextInputStyle.Short)
          .setValue(panel.title)
          .setMaxLength(256)
          .setRequired(true);

        const descInput = new TextInputBuilder()
          .setCustomId("description")
          .setLabel("설명 (여러 줄 입력 가능)")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(panel.description)
          .setMaxLength(4000)
          .setRequired(true);

        const modeInput = new TextInputBuilder()
          .setCustomId("mode")
          .setLabel("모드 (MULTI 또는 SINGLE)")
          .setStyle(TextInputStyle.Short)
          .setValue(panel.mode)
          .setMaxLength(10)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(modeInput)
        );

        await interaction.showModal(modal);
        return;
      }

      if (sub === "delete") {
        const panelId = interaction.options.getString("panel_id", true);
        const deleteMessage = interaction.options.getBoolean("delete_message") ?? true;

        const panel = await prisma.role_panels.findUnique({ where: { id: panelId } });
        if (!panel) {
          await interaction.reply({ content: "패널을 찾을 수 없습니다.", ephemeral: true });
          return;
        }

        // 게시된 메시지 삭제 시도
        if (deleteMessage && panel.published_channel_id && panel.published_message_id) {
          try {
            const channel = interaction.guild?.channels.cache.get(panel.published_channel_id);
            if (channel?.type === ChannelType.GuildText) {
              const message = await channel.messages.fetch(panel.published_message_id);
              await message.delete();
            }
          } catch (error) {
            context.logger.warn({ err: error }, "Failed to delete panel message");
          }
        }

        // DB에서 패널 항목 및 패널 삭제
        await prisma.role_panel_items.deleteMany({ where: { panel_id: panelId } });
        await prisma.role_panels.delete({ where: { id: panelId } });

        await interaction.reply({ content: "패널을 삭제했습니다.", ephemeral: true });
        return;
      }

      if (sub === "edit_item") {
        const panelId = interaction.options.getString("panel_id", true);
        const oldEmojiInput = interaction.options.getString("old_emoji", true);
        const oldEmojiId = isCustomEmoji(oldEmojiInput);

        if (!oldEmojiId) {
          await interaction.reply({ content: "유효한 커스텀 이모지를 입력하세요.", ephemeral: true });
          return;
        }

        // 기존 항목 찾기
        const existingItem = await prisma.role_panel_items.findFirst({
          where: { panel_id: panelId, emoji_id: oldEmojiId },
        });

        if (!existingItem) {
          await interaction.reply({ content: "해당 이모지의 레이블을 찾을 수 없습니다.", ephemeral: true });
          return;
        }

        // 업데이트할 데이터 준비
        const updateData: any = {};

        const newEmojiInput = interaction.options.getString("new_emoji", false);
        if (newEmojiInput) {
          const newEmojiId = isCustomEmoji(newEmojiInput);
          if (!newEmojiId) {
            await interaction.reply({ content: "새 이모지가 유효하지 않습니다.", ephemeral: true });
            return;
          }
          updateData.emoji_id = newEmojiId;
        }

        const newRole = interaction.options.getRole("role", false);
        if (newRole) {
          updateData.role_id = newRole.id;
        }

        const newLabel = interaction.options.getString("label", false);
        if (newLabel !== null) {
          updateData.label = newLabel;
        }

        const newOrder = interaction.options.getInteger("order", false);
        if (newOrder !== null) {
          updateData.sort_order = newOrder;
        }

        // 업데이트할 항목이 없는 경우
        if (Object.keys(updateData).length === 0) {
          await interaction.reply({ content: "수정할 항목을 하나 이상 지정해주세요.", ephemeral: true });
          return;
        }

        try {
          await prisma.role_panel_items.update({
            where: { id: existingItem.id },
            data: updateData,
          });
          await interaction.reply({ content: "레이블을 수정했습니다. `/panel publish`로 변경사항을 적용하세요.", ephemeral: true });
        } catch (error) {
          context.logger.error({ err: error }, "Failed to update panel item");
          await interaction.reply({ content: "레이블 수정에 실패했습니다.", ephemeral: true });
        }
        return;
      }
    },
  },
];

async function handleModalSubmit(interaction: ModalSubmitInteraction, context: AppContext) {
  const [prefix, panelId] = interaction.customId.split(":");
  if (prefix !== "panel_edit" || !panelId) return;

  const title = interaction.fields.getTextInputValue("title");
  const description = interaction.fields.getTextInputValue("description");
  const modeInput = interaction.fields.getTextInputValue("mode").toUpperCase();

  // 디버깅: 실제 입력값 확인
  context.logger.info({ title, description, mode: modeInput }, "Modal submit values");

  // 모드 검증
  if (modeInput !== "MULTI" && modeInput !== "SINGLE") {
    await interaction.reply({ content: "모드는 MULTI 또는 SINGLE만 입력 가능합니다.", ephemeral: true });
    return;
  }

  const mode = modeInput as PanelMode;

  try {
    await context.db.role_panels.update({
      where: { id: panelId },
      data: { title, description, mode },
    });
    await interaction.reply({ content: "패널을 수정했습니다. `/panel publish`로 변경사항을 적용하세요.", ephemeral: true });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to update panel");
    await interaction.reply({ content: "패널 수정에 실패했습니다.", ephemeral: true });
  }
}

const rolePanelsModule: BotModule = {
  name: "rolePanels",
  commands,
  register: (context) => {
    const { client } = context;
    client.on("interactionCreate", async (interaction) => {
      if (interaction.isButton() && interaction.customId.startsWith(BUTTON_PREFIX)) {
        await handleButton(interaction, context);
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith("panel_edit:")) {
        await handleModalSubmit(interaction, context);
      }
    });
  },
};

export default rolePanelsModule;
