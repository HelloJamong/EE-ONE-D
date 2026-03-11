import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { BotModule, AppContext } from "../../types.js";
import { handleAddCommand, handleRemoveCommand, handleListCommand, handleReloadCommand } from "./handlers.js";

function ensureAdministrator(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has("Administrator")) {
    throw new Error("Administrator 권한이 필요합니다.");
  }
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("cmd")
      .setDescription("커스텀 명령어를 관리합니다.")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("새 커스텀 명령어를 추가합니다.")
          .addStringOption((opt) =>
            opt
              .setName("name")
              .setDescription("명령어 이름 (소문자, 숫자, _, - 만 사용, 1-32자)")
              .setRequired(true)
          )
          .addStringOption((opt) =>
            opt
              .setName("response")
              .setDescription("명령어 실행 시 출력할 텍스트 (최대 2000자)")
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("커스텀 명령어를 삭제합니다.")
          .addStringOption((opt) =>
            opt
              .setName("name")
              .setDescription("삭제할 명령어 이름")
              .setRequired(true)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("등록된 커스텀 명령어 목록을 조회합니다.")
      )
      .addSubcommand((sub) =>
        sub.setName("reload").setDescription("커스텀 명령어를 재등록합니다. (디버깅용)")
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
        case "add":
          await handleAddCommand(interaction, context);
          break;
        case "remove":
          await handleRemoveCommand(interaction, context);
          break;
        case "list":
          await handleListCommand(interaction, context);
          break;
        case "reload":
          await handleReloadCommand(interaction, context);
          break;
      }
    },
  },
];

const customCommandsModule: BotModule = {
  name: "customCommands",
  commands,
  register: (context) => {
    // 자동완성 핸들러 등록
    context.client.on("interactionCreate", async (interaction) => {
      if (interaction.isAutocomplete() && interaction.commandName === "cmd") {
        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === "name") {
          const customCmds = await context.db.custom_commands.findMany({
            where: { guild_id: interaction.guildId! },
            select: { name: true },
          });
          const filtered = customCmds
            .filter((cmd) => cmd.name.startsWith(focusedOption.value))
            .slice(0, 25);
          await interaction.respond(
            filtered.map((cmd) => ({ name: cmd.name, value: cmd.name }))
          );
        }
      }
    });
  },
};

export default customCommandsModule;
