import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { BotModule, AppContext } from "../../types.js";

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("help")
      .setDescription("사용 가능한 명령어 목록을 확인합니다."),
    handle: async (interaction: ChatInputCommandInteraction, context: AppContext) => {
      try {
        // 관리자 여부 확인
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false;

        // 커스텀 명령어 목록
        const customCommands = await context.db.custom_commands.findMany({
          where: { guild_id: interaction.guildId! },
          select: { name: true, description: true, response: true },
        });

        const customCommandList = customCommands.length > 0
          ? customCommands
              .map((cmd) => {
                const desc = cmd.description || cmd.response.slice(0, 100);
                return `\`/${cmd.name}\` - ${desc}`;
              })
              .join("\n")
          : "등록된 커스텀 명령어가 없습니다.";

        // 임베드 생성
        const embed = new EmbedBuilder()
          .setTitle("📚 명령어 목록")
          .setDescription("EE-ONE-D 봇에서 사용 가능한 명령어입니다.\n\n[GitHub 이슈 제보 및 문의](https://github.com/HelloJamong/EE-ONE-D/issues)")
          .setColor(0x5865f2)
          .setTimestamp();

        // 관리자인 경우에만 기본 명령어 표시
        if (isAdmin) {
          const staticCommands = context.staticCommands || [];
          const staticCommandList = staticCommands
            .map((cmd) => `\`/${cmd.data.name}\` - ${cmd.data.description}`)
            .join("\n");

          embed.addFields(
            { name: "📌 기본 명령어 (관리자 전용)", value: staticCommandList || "없음" },
            { name: "⚙️ 커스텀 명령어", value: customCommandList }
          );
        } else {
          // 일반 유저는 커스텀 명령어만 표시
          embed.addFields(
            { name: "⚙️ 사용 가능한 명령어", value: customCommandList }
          );
        }

        // DM 전송 시도
        try {
          await interaction.user.send({ embeds: [embed] });
          await interaction.reply({
            content: "DM으로 명령어 목록을 전송했습니다. 📬",
            ephemeral: true,
          });
        } catch (error) {
          // DM 전송 실패 시 채널에 임시 메시지 전송
          context.logger.warn({ err: error, userId: interaction.user.id }, "Failed to send DM");
          await interaction.reply({
            content: "DM 전송에 실패했습니다. DM 수신 설정을 확인해주세요.",
            ephemeral: true,
          });
        }
      } catch (error) {
        context.logger.error({ err: error }, "Failed to execute help command");
        await interaction.reply({
          content: "명령어 목록을 가져오는 중 오류가 발생했습니다.",
          ephemeral: true,
        });
      }
    },
  },
];

const helpModule: BotModule = {
  name: "help",
  commands,
};

export default helpModule;
