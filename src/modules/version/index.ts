import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { BotModule, AppContext } from "../../types.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersionInfo() {
  try {
    const changelogPath = join(__dirname, "../../../CHANGELOG.md");
    const changelog = readFileSync(changelogPath, "utf-8");

    // 첫 번째 버전 섹션 파싱: ## [1.0.6] - 2026-03-13
    const versionMatch = changelog.match(/##\s*\[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/);

    if (versionMatch) {
      return {
        version: versionMatch[1],
        date: versionMatch[2],
      };
    }
  } catch (error) {
    // CHANGELOG 파싱 실패 시 package.json 사용
  }

  // Fallback: package.json
  try {
    const packagePath = join(__dirname, "../../../package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf-8"));
    return {
      version: packageJson.version || "Unknown",
      date: "N/A",
    };
  } catch (error) {
    return {
      version: "Unknown",
      date: "N/A",
    };
  }
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("version")
      .setDescription("봇의 현재 버전과 최종 업데이트 날짜를 확인합니다."),
    handle: async (interaction: ChatInputCommandInteraction, context: AppContext) => {
      try {
        const { version, date } = getVersionInfo();

        const embed = new EmbedBuilder()
          .setTitle("🤖 EE-ONE-D 봇 버전 정보")
          .setDescription("현재 실행 중인 봇의 버전 정보입니다.")
          .addFields(
            { name: "📦 버전", value: `\`v${version}\``, inline: true },
            { name: "📅 최종 업데이트", value: date, inline: true }
          )
          .setColor(0x5865f2)
          .setFooter({ text: "GitHub에서 최신 버전 확인하기" })
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch (error) {
        context.logger.error({ err: error }, "Failed to execute version command");
        await interaction.reply({
          content: "버전 정보를 가져오는 중 오류가 발생했습니다.",
          ephemeral: true,
        });
      }
    },
  },
];

const versionModule: BotModule = {
  name: "version",
  commands,
};

export default versionModule;
