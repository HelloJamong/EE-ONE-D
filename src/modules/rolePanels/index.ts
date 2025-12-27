import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  Role,
  SlashCommandBuilder,
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

function buildPanelEmbed(panel: any, items: any[]) {
  const embed = new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(panel.description)
    .setFooter({ text: `패널: ${panel.id} | 모드: ${panel.mode}` });

  items
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((item) => {
      embed.addFields({ name: `${item.label}`, value: `<@&${item.role_id}>`, inline: true });
    });
  return embed;
}

function buildButtons(items: any[]) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const sorted = items.sort((a, b) => a.sort_order - b.sort_order);
  for (let i = 0; i < sorted.length; i += 4) {
    const slice = sorted.slice(i, i + 4);
    const row = new ActionRowBuilder<ButtonBuilder>();
    slice.forEach((item) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${BUTTON_PREFIX}:${item.panel_id}:${item.id}`)
          .setLabel(item.label)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji({ id: item.emoji_id })
      );
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

  const embed = buildPanelEmbed(panel, panel.items);
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
    interaction.client.logger?.error({ err: error }, "Failed to publish panel");
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
          .setDescription("새 패널을 생성합니다.")
          .addStringOption((opt) =>
            opt
              .setName("mode")
              .setDescription("패널 모드")
              .addChoices(
                { name: "multi", value: "MULTI" },
                { name: "single", value: "SINGLE" }
              )
              .setRequired(true)
          )
          .addStringOption((opt) =>
            opt.setName("title").setDescription("패널 제목").setRequired(true)
          )
          .addStringOption((opt) =>
            opt.setName("description").setDescription("패널 설명").setRequired(true)
          )
          .addBooleanOption((opt) =>
            opt
              .setName("allow_none")
              .setDescription("싱글 모드에서 선택 해제 허용")
              .setRequired(false)
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
            opt.setName("label").setDescription("버튼 라벨").setRequired(true)
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
          .setDescription("패널에 등록된 항목을 조회합니다.")
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
      ),
    handle: async (interaction, context) => {
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
        await ensureAdminChannel(interaction, settings?.admin_config_channel_id);
      } catch (error) {
        await interaction.reply({ content: (error as Error).message, ephemeral: true });
        return;
      }

      const sub = interaction.options.getSubcommand();

      if (sub === "create") {
        const mode = interaction.options.getString("mode", true) as PanelMode;
        const title = interaction.options.getString("title", true);
        const description = interaction.options.getString("description", true);
        const allowNone = interaction.options.getBoolean("allow_none") ?? true;

        const created = await prisma.role_panels.create({
          data: {
            guild_id: guildId,
            mode,
            allow_none: allowNone,
            title,
            description,
            created_by: interaction.user.id,
          },
        });

        await interaction.reply({
          content: `패널을 생성했습니다: ${created.id}`,
          ephemeral: true,
        });
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
        const label = interaction.options.getString("label", true);
        const order = interaction.options.getInteger("order") ?? 0;

        await prisma.role_panel_items.create({
          data: {
            panel_id: panelId,
            emoji_id: emojiId,
            role_id: role.id,
            label,
            sort_order: order,
          },
        });

        await interaction.reply({ content: "패널 항목을 추가했습니다.", ephemeral: true });
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
        const panelId = interaction.options.getString("panel_id", true);
        const items = await prisma.role_panel_items.findMany({
          where: { panel_id: panelId },
          orderBy: { sort_order: "asc" },
        });
        if (!items.length) {
          await interaction.reply({ content: "등록된 항목이 없습니다.", ephemeral: true });
          return;
        }
        const rows = items
          .map((item) => `${item.label} | emoji:${item.emoji_id} | role:${item.role_id} | order:${item.sort_order}`)
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
        const channel = interaction.options.getChannel("channel", true);
        const messageId = interaction.options.getString("message_id", true);
        if (channel.type !== ChannelType.GuildText) {
          await interaction.reply({ content: "텍스트 채널만 사용할 수 있습니다.", ephemeral: true });
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
    },
  },
];

const rolePanelsModule: BotModule = {
  name: "rolePanels",
  commands,
  register: (context) => {
    const { client } = context;
    client.on("interactionCreate", async (interaction) => {
      if (interaction.isButton() && interaction.customId.startsWith(BUTTON_PREFIX)) {
        await handleButton(interaction, context);
      }
    });
  },
};

export default rolePanelsModule;
