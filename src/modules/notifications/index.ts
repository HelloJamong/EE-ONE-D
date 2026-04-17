import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { BotModule, AppContext } from "../../types.js";
import { handleSend, handleEdit, handleRemove } from "./handlers.js";
import { handleSendModal, handleEditModal, createPollModal, handlePollModal } from "./modals.js";
import { handlePollButton, scheduleActivePollTimers } from "./poll.js";

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
      )
      .addSubcommand((sub) =>
        sub
          .setName("poll")
          .setDescription("투표를 생성합니다.")
          .addIntegerOption((opt) =>
            opt
              .setName("duration")
              .setDescription("투표 마감 시간 (시간 단위, 기본 1시간, 최대 24시간)")
              .setMinValue(1)
              .setMaxValue(24)
              .setRequired(false)
          )
          .addBooleanOption((opt) =>
            opt
              .setName("allow_multiple")
              .setDescription("중복 투표 허용 여부 (기본: 불가)")
              .setRequired(false)
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
        case "poll": {
          if (!settings?.notification_channel_id) {
            await interaction.reply({
              content: "공지사항 채널이 설정되지 않았습니다. `/config set notification_channel`을 먼저 실행해주세요.",
              ephemeral: true,
            });
            return;
          }
          const duration = interaction.options.getInteger("duration") ?? 1;
          const allowMultiple = interaction.options.getBoolean("allow_multiple") ?? false;
          const modal = createPollModal(duration, allowMultiple);
          await interaction.showModal(modal);
          break;
        }
      }
    },
  },
];

const notificationsModule: BotModule = {
  name: "notifications",
  commands,
  register: (context) => {
    scheduleActivePollTimers(context);

    context.client.on("interactionCreate", async (interaction) => {
      if (interaction.isModalSubmit()) {
        if (interaction.customId === "noti_send_modal") {
          await handleSendModal(interaction, context);
        } else if (interaction.customId.startsWith("noti_edit_modal:")) {
          await handleEditModal(interaction, context);
        } else if (interaction.customId.startsWith("noti_poll_modal:")) {
          await handlePollModal(interaction, context);
        }
      } else if (interaction.isButton() && interaction.customId.startsWith("poll:")) {
        await handlePollButton(interaction, context);
      }
    });
  },
};

export default notificationsModule;
