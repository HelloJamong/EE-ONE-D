import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Role } from "discord.js";
import { BotModule, AppContext } from "../../types.js";

async function handleStatsCommand(
  interaction: ChatInputCommandInteraction,
  context: AppContext
) {
  const role = interaction.options.getRole("role", true) as Role;

  await interaction.deferReply({ ephemeral: true });

  try {
    // Fetch all members to ensure cache is populated
    await interaction.guild!.members.fetch();

    // Get members with this role
    const membersWithRole = role.members.map(member => member.user);

    if (membersWithRole.length === 0) {
      await interaction.editReply({
        content: `**${role.name}** 역할을 가진 사용자가 없습니다.`,
      });
      return;
    }

    // Create embed with user list
    const embed = new EmbedBuilder()
      .setTitle(`${role.name} 역할 보유 사용자`)
      .setColor(role.color || 0x5865f2)
      .setDescription(
        membersWithRole
          .slice(0, 50) // Discord embed description limit
          .map((user, idx) => `${idx + 1}. ${user.tag} (${user.id})`)
          .join("\n")
      )
      .setFooter({ text: `총 ${membersWithRole.length}명` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to fetch role stats");
    await interaction.editReply({
      content: "역할 통계 조회 중 오류가 발생했습니다.",
    });
  }
}

async function handleListCommand(
  interaction: ChatInputCommandInteraction,
  context: AppContext
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Fetch all members to ensure cache is populated
    await interaction.guild!.members.fetch();

    // Get all roles except @everyone
    const roles = interaction.guild!.roles.cache
      .filter(role => role.name !== "@everyone")
      .sort((a, b) => b.position - a.position); // Sort by position (highest first)

    if (roles.size === 0) {
      await interaction.editReply({
        content: "서버에 역할이 없습니다.",
      });
      return;
    }

    // Create role statistics
    const roleStats = roles.map(role => ({
      name: role.name,
      count: role.members.size,
      color: role.color,
      position: role.position,
    }));

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle("서버 역할 통계")
      .setColor(0x5865f2)
      .setDescription(
        roleStats
          .slice(0, 25) // Discord embed field limit
          .map((stat, idx) => {
            const colorDot = stat.color ? `🔵` : `⚪`;
            return `${colorDot} **${stat.name}** - ${stat.count}명`;
          })
          .join("\n")
      )
      .setFooter({ text: `총 ${roles.size}개 역할` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to fetch role list");
    await interaction.editReply({
      content: "역할 목록 조회 중 오류가 발생했습니다.",
    });
  }
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("role")
      .setDescription("역할 통계를 조회합니다.")
      .addSubcommand((sub) =>
        sub
          .setName("stats")
          .setDescription("특정 역할을 가진 사용자 목록을 조회합니다.")
          .addRoleOption((opt) =>
            opt
              .setName("role")
              .setDescription("조회할 역할")
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("모든 역할과 사용자 수를 조회합니다.")
      ),
    handle: async (interaction: ChatInputCommandInteraction, context: AppContext) => {
      const sub = interaction.options.getSubcommand();

      switch (sub) {
        case "stats":
          await handleStatsCommand(interaction, context);
          break;
        case "list":
          await handleListCommand(interaction, context);
          break;
      }
    },
  },
];

const roleStatsModule: BotModule = {
  name: "roleStats",
  commands,
};

export default roleStatsModule;
