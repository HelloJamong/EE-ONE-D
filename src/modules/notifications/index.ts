import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { BotModule, AppContext } from "../../types.js";
import { handleSend, handleEdit, handleRemove } from "./handlers.js";
import { handleSendModal, handleEditModal } from "./modals.js";

function ensureAdministrator(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has("Administrator")) {
    throw new Error("Administrator 권한이 필요합니다.");
  }
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("noti")
      .setDescription("공지사항을 관리합니다.")
      .addSubcommand((sub) =>
        sub.setName("send").setDescription("새 공지사항을 발송합니다.")
      )
      .addSubcommand((sub) =>
        sub
          .setName("edit")
          .setDescription("발송된 공지사항을 수정합니다.")
          .addStringOption((opt) =>
            opt
              .setName("message_id")
              .setDescription("수정할 메시지 ID")
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("공지사항을 삭제합니다.")
          .addStringOption((opt) =>
            opt
              .setName("message_id")
              .setDescription("삭제할 메시지 ID")
              .setRequired(true)
          )
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

      switch (sub) {
        case "send":
          await handleSend(interaction, context);
          break;
        case "edit":
          await handleEdit(interaction, context);
          break;
        case "remove":
          await handleRemove(interaction, context);
          break;
      }
    },
  },
];

const notificationsModule: BotModule = {
  name: "notifications",
  commands,
  register: (context) => {
    context.client.on("interactionCreate", async (interaction) => {
      if (interaction.isModalSubmit()) {
        if (interaction.customId === "noti_send_modal") {
          await handleSendModal(interaction, context);
        } else if (interaction.customId.startsWith("noti_edit_modal:")) {
          await handleEditModal(interaction, context);
        }
      }
    });
  },
};

export default notificationsModule;
