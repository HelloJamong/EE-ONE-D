import {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonInteraction,
  ChannelType,
  TextChannel,
} from "discord.js";
import { AppContext } from "../../types.js";

const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

export function buildPollComponents(pollId: string, options: string[], closed: boolean) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < options.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    const chunk = options.slice(i, i + 5);
    chunk.forEach((_, j) => {
      const idx = i + j;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`poll:${pollId}:${idx}`)
          .setLabel(NUMBER_EMOJIS[idx])
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(closed)
      );
    });
    rows.push(row);
  }
  return rows;
}

export function buildPollEmbed(
  title: string,
  options: string[],
  voteCounts: number[],
  allowMultiple: boolean,
  endsAt: Date,
  closed: boolean
) {
  const total = voteCounts.reduce((a, b) => a + b, 0);

  const optionLines = options.map((opt, i) => {
    const count = voteCounts[i] ?? 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `${NUMBER_EMOJIS[i]} ${opt} — **${count}표** (${pct}%)`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${title}`)
    .setDescription(optionLines.join("\n"))
    .setColor(closed ? 0x808080 : 0x5865f2)
    .setFooter({
      text: [
        `총 ${total}표`,
        `중복투표: ${allowMultiple ? "가능" : "불가"}`,
        closed ? "투표 마감됨" : `마감: <t:${Math.floor(endsAt.getTime() / 1000)}:R>`,
      ].join(" | "),
    });

  if (!closed) {
    embed.setDescription(
      optionLines.join("\n") +
        `\n\n마감: <t:${Math.floor(endsAt.getTime() / 1000)}:R>`
    );
  }

  return embed;
}

export async function handlePollButton(
  interaction: ButtonInteraction,
  context: AppContext
) {
  const [, pollId, optionIndexStr] = interaction.customId.split(":");
  const optionIndex = parseInt(optionIndexStr, 10);

  await interaction.deferReply({ ephemeral: true });

  try {
    const poll = await context.db.poll_messages.findUnique({
      where: { id: pollId },
      include: { votes: true },
    });

    if (!poll) {
      await interaction.editReply({ content: "투표를 찾을 수 없습니다." });
      return;
    }

    if (poll.closed || poll.ends_at <= new Date()) {
      await interaction.editReply({ content: "이미 마감된 투표입니다." });
      if (!poll.closed) {
        await closePoll(pollId, context);
      }
      return;
    }

    const userId = interaction.user.id;
    const userVotes = poll.votes.filter((v) => v.user_id === userId);

    if (!poll.allow_multiple && userVotes.length > 0) {
      // 같은 항목 재클릭 → 취소
      const existingVote = userVotes.find((v) => v.option_index === optionIndex);
      if (existingVote) {
        await context.db.poll_votes.delete({ where: { id: existingVote.id } });
        await refreshPollMessage(poll.id, context);
        await interaction.editReply({ content: "투표를 취소했습니다." });
        return;
      }
      // 다른 항목 → 기존 표 교체
      await context.db.poll_votes.deleteMany({ where: { poll_id: pollId, user_id: userId } });
      await context.db.poll_votes.create({
        data: { poll_id: pollId, user_id: userId, option_index: optionIndex },
      });
      await refreshPollMessage(poll.id, context);
      await interaction.editReply({
        content: `${NUMBER_EMOJIS[optionIndex]} 항목으로 투표했습니다.`,
      });
      return;
    }

    // 중복 투표 허용 모드에서 같은 항목 재클릭 → 취소
    const existingVote = userVotes.find((v) => v.option_index === optionIndex);
    if (existingVote) {
      await context.db.poll_votes.delete({ where: { id: existingVote.id } });
      await refreshPollMessage(poll.id, context);
      await interaction.editReply({ content: "해당 항목 투표를 취소했습니다." });
      return;
    }

    await context.db.poll_votes.create({
      data: { poll_id: pollId, user_id: userId, option_index: optionIndex },
    });

    await refreshPollMessage(poll.id, context);
    await interaction.editReply({
      content: `${NUMBER_EMOJIS[optionIndex]} 항목에 투표했습니다.`,
    });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to handle poll button");
    await interaction.editReply({ content: "투표 처리 중 오류가 발생했습니다." });
  }
}

async function refreshPollMessage(pollId: string, context: AppContext) {
  const poll = await context.db.poll_messages.findUnique({
    where: { id: pollId },
    include: { votes: true },
  });
  if (!poll) return;

  const voteCounts = poll.options.map(
    (_, i) => poll.votes.filter((v) => v.option_index === i).length
  );

  try {
    const channel = await context.client.channels.fetch(poll.channel_id);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    const message = await (channel as TextChannel).messages.fetch(poll.message_id);
    if (!message) return;

    const embed = buildPollEmbed(
      poll.title,
      poll.options,
      voteCounts,
      poll.allow_multiple,
      poll.ends_at,
      poll.closed
    );
    const components = buildPollComponents(poll.id, poll.options, poll.closed);
    await message.edit({ embeds: [embed], components });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to refresh poll message");
  }
}

export async function closePoll(pollId: string, context: AppContext) {
  const poll = await context.db.poll_messages.findUnique({
    where: { id: pollId },
    include: { votes: true },
  });
  if (!poll || poll.closed) return;

  await context.db.poll_messages.update({
    where: { id: pollId },
    data: { closed: true },
  });

  const voteCounts = poll.options.map(
    (_, i) => poll.votes.filter((v) => v.option_index === i).length
  );

  try {
    const channel = await context.client.channels.fetch(poll.channel_id);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    const message = await (channel as TextChannel).messages.fetch(poll.message_id);
    if (!message) return;

    const embed = buildPollEmbed(
      poll.title,
      poll.options,
      voteCounts,
      poll.allow_multiple,
      poll.ends_at,
      true
    );
    const components = buildPollComponents(poll.id, poll.options, true);
    await message.edit({ embeds: [embed], components });
  } catch (error) {
    context.logger.error({ err: error }, "Failed to close poll message");
  }
}

export async function scheduleActivePollTimers(context: AppContext) {
  try {
    const activePolls = await context.db.poll_messages.findMany({
      where: { closed: false, ends_at: { gt: new Date() } },
    });

    for (const poll of activePolls) {
      const remaining = poll.ends_at.getTime() - Date.now();
      setTimeout(() => closePoll(poll.id, context), remaining);
    }

    // 이미 만료됐지만 아직 closed=false인 것도 처리
    const overduePolls = await context.db.poll_messages.findMany({
      where: { closed: false, ends_at: { lte: new Date() } },
    });
    for (const poll of overduePolls) {
      await closePoll(poll.id, context);
    }

    context.logger.info(
      `Scheduled ${activePolls.length} poll timer(s), closed ${overduePolls.length} overdue poll(s)`
    );
  } catch (error) {
    context.logger.error({ err: error }, "Failed to schedule poll timers");
  }
}
