import {
  EmbedBuilder,
  GuildMember,
  Message,
  PartialGuildMember,
  PartialMessage,
  VoiceState,
  ChannelType,
  TextChannel,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  AttachmentBuilder,
} from "discord.js";
import { BotModule, AppContext } from "../../types.js";
import { BoundedBufferCache, BufferFile } from "../../shared/cache.js";

const COLORS: Record<string, number> = {
  VOICE_JOIN: 0x57f287,
  VOICE_LEAVE: 0xed4245,
  VOICE_MOVE: 0xfee75c,
  MESSAGE_DELETE: 0xed4245,
  MESSAGE_EDIT: 0xfee75c,
  MEMBER_JOIN: 0x57f287,
  MEMBER_LEAVE: 0xed4245,
  ROLE_GRANTED: 0x5865f2,
  ROLE_REVOKED: 0x5865f2,
  CONFIG_UPDATED: 0xfee75c,
};

async function fetchSettings(context: AppContext, guildId: string) {
  return context.db.guild_settings.findUnique({ where: { guild_id: guildId } });
}

async function isAuditEnabled(context: AppContext, guildId: string): Promise<boolean> {
  const settings = await fetchSettings(context, guildId);
  // log_channel_id가 설정되어 있으면 자동으로 감사 로그 활성화
  return !!settings?.log_channel_id;
}

interface SendLogOptions {
  fields?: { name: string; value: string; inline?: boolean }[];
  imageUrl?: string;
  files?: AttachmentBuilder[];
  footer?: string;
  author?: {
    name: string;
    iconURL?: string;
    url?: string;
  };
  title?: string;
  url?: string;
}

async function sendLog(
  context: AppContext,
  guildId: string,
  eventType: string,
  details: any,
  messageBuilder: () => string,
  options: SendLogOptions = {}
) {
  const enabled = await isAuditEnabled(context, guildId);
  if (!enabled) {
    context.logger.debug({ guildId, eventType }, "Audit skipped: logging disabled (no log channel)");
    return;
  }

  await context.db.audit_events.create({
    data: {
      guild_id: guildId,
      event_type: eventType,
      actor_id: details.actor_id,
      channel_id: details.channel_id,
      target_id: details.target_id,
      details,
    },
  });

  const settings = await fetchSettings(context, guildId);
  if (!settings?.log_channel_id) {
    context.logger.debug({ guildId, eventType }, "Audit skipped: no log channel set");
    return;
  }
  const channel = context.client.channels.cache.get(settings.log_channel_id) as TextChannel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    context.logger.debug(
      { guildId, eventType, channelId: settings.log_channel_id },
      "Audit skipped: log channel not found in cache"
    );
    return;
  }

  const embed = new EmbedBuilder()
    .setDescription(messageBuilder())
    .setColor(COLORS[eventType] ?? 0x2f3136)
    .setTimestamp(new Date());

  if (options.title) {
    embed.setTitle(options.title);
  }

  if (options.url) {
    embed.setURL(options.url);
  }

  if (options.author) {
    embed.setAuthor(options.author);
  }

  if (options.fields?.length) {
    embed.addFields(options.fields);
  }

  if (options.footer) {
    embed.setFooter({ text: options.footer });
  }

  if (options.imageUrl && !options.files?.length) {
    // files가 없을 때만 imageUrl 사용 (fallback)
    embed.setImage(options.imageUrl);
  }

  const messageOptions: any = { embeds: [embed] };
  if (options.files?.length) {
    messageOptions.files = options.files;
    // 첫 번째 파일을 임베드 이미지로 설정
    if (options.files[0]) {
      embed.setImage(`attachment://${options.files[0].name}`);
    }
  }

  await channel.send(messageOptions);
}

function displayUser(user: any) {
  return `${user?.tag ?? user?.username ?? "unknown"} (${user?.id ?? "-"})`;
}

// /audit 명령어는 제거되었습니다.
// /config set log_channel 명령어로 로그 채널을 설정하면 자동으로 감사 로그가 활성화됩니다.
const commands: any[] = [];

const auditModule: BotModule = {
  name: "audit",
  commands,
  register: (context: AppContext) => {
    const { client, logger } = context;

    // 삭제 이미지 복원용: 게시 시점 이미지 바이트를 유한 메모리에 보관(바이트 상한 LRU).
    // 디스코드 CDN URL은 ~24h 후 만료되고 오래된 메시지는 partial로 와 삭제 시점 다운로드가 불가능하므로,
    // 게시 시점에 미리 받아둔다.
    const MAX_IMAGE_CACHE_BYTES = 200 * 1024 * 1024; // 총 200MB
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 개별 이미지 10MB 초과는 스킵
    const imageCache = new BoundedBufferCache(MAX_IMAGE_CACHE_BYTES);

    client.on("messageCreate", async (message: Message) => {
      // ponytail: audit 활성 여부를 매 메시지 DB 조회하지 않고 항상 캐시(단일 길드 봇, 메모리는 바이트 상한으로 제한)
      if (!message.guild || message.author?.bot) return;
      const images = message.attachments.filter((a) => a.contentType?.startsWith("image/"));
      if (images.size === 0) return;
      try {
        const files: BufferFile[] = [];
        for (const [, attachment] of images) {
          if (attachment.size > MAX_IMAGE_BYTES) continue;
          const response = await fetch(attachment.url);
          if (!response.ok) continue;
          const data = Buffer.from(await response.arrayBuffer());
          files.push({ name: attachment.name ?? "image.png", data });
        }
        if (files.length > 0) imageCache.set(message.id, files);
      } catch (err) {
        logger.warn({ err, messageId: message.id }, "Failed to cache image attachment");
      }
    });

    client.on("voiceStateUpdate", async (oldState: VoiceState, newState: VoiceState) => {
      const guildId = newState.guild.id;
      if (oldState.channelId === newState.channelId) return;
      try {
        const member = newState.member ?? oldState.member;
        if (!member) return;

        const author = {
          name: member.user.tag,
          iconURL: member.user.displayAvatarURL(),
        };

        const footer = `ID: ${member.id}`;

        if (!oldState.channelId && newState.channelId) {
          // 음성 채널 참가
          await sendLog(
            context,
            guildId,
            "VOICE_JOIN",
            {
              actor_id: newState.id,
              channel_id: newState.channelId,
              target_id: newState.channelId,
            },
            () => `joined voice channel <#${newState.channelId}>`,
            { author, footer }
          );
        } else if (oldState.channelId && !newState.channelId) {
          // 음성 채널 퇴장
          await sendLog(
            context,
            guildId,
            "VOICE_LEAVE",
            {
              actor_id: oldState.id,
              channel_id: oldState.channelId,
              target_id: oldState.channelId,
            },
            () => `left voice channel <#${oldState.channelId}>`,
            { author, footer }
          );
        } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
          // 음성 채널 이동
          await sendLog(
            context,
            guildId,
            "VOICE_MOVE",
            {
              actor_id: newState.id,
              channel_id: newState.channelId,
              target_id: newState.channelId,
              from_channel_id: oldState.channelId,
            },
            () => `moved from <#${oldState.channelId}> to <#${newState.channelId}>`,
            { author, footer }
          );
        }
      } catch (error) {
        logger.warn({ err: error }, "Voice audit failed");
      }
    });

    client.on("messageDelete", async (message: Message | PartialMessage) => {
      if (!message.guild || message.author?.bot) return;
      try {
        const attachments = message.attachments?.map((a) => ({
          name: a.name,
          url: a.url,
          contentType: a.contentType,
        })) ?? [];

        const imageAttachments = message.attachments?.filter((a) =>
          a.contentType?.startsWith("image/")
        );

        const author = message.author
          ? {
              name: message.author.tag,
              iconURL: message.author.displayAvatarURL(),
            }
          : undefined;

        const footer = message.author
          ? `User ID: ${message.author.id} | Message ID: ${message.id}`
          : `Message ID: ${message.id}`;

        // 설명 생성
        let description = `Message deleted in <#${message.channelId}>`;
        if (message.content) {
          description += `\n\n${message.content.slice(0, 1024)}`;
        }

        const fields: { name: string; value: string }[] = [];

        // 이미지가 아닌 첨부파일 표시
        if (attachments.length > 0 && !imageAttachments?.size) {
          const attachmentList = attachments
            .filter((a) => !a.contentType?.startsWith("image/"))
            .map((a) => `[${a.name}](${a.url})`)
            .join("\n")
            .slice(0, 1024);
          if (attachmentList) {
            fields.push({ name: "Attachments", value: attachmentList });
          }
        }

        // 이미지 복원: 게시 시점에 캐시한 원본을 우선 사용(가장 신뢰도 높음, partial 메시지여도 동작).
        // 캐시 미스일 때만 삭제 시점 라이브 다운로드(폴백, CDN URL 만료 시 실패 가능).
        const files: AttachmentBuilder[] = [];
        const cached = imageCache.take(message.id);
        if (cached) {
          for (const f of cached) {
            files.push(new AttachmentBuilder(f.data, { name: f.name }));
          }
        } else if (imageAttachments && imageAttachments.size > 0) {
          for (const [, attachment] of imageAttachments) {
            try {
              const response = await fetch(attachment.url);
              if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                const file = new AttachmentBuilder(buffer, { name: attachment.name ?? "image.png" });
                files.push(file);
              }
            } catch (err) {
              logger.warn({ err, url: attachment.url }, "Failed to download image attachment");
            }
          }
        }

        await sendLog(
          context,
          message.guild.id,
          "MESSAGE_DELETE",
          {
            actor_id: message.author?.id ?? "unknown",
            channel_id: message.channelId,
            target_id: message.id,
            content: message.content ?? "N/A",
            attachments,
          },
          () => description,
          {
            author,
            fields: fields.length > 0 ? fields : undefined,
            files: files.length > 0 ? files : undefined,
            footer,
          }
        );
      } catch (error) {
        logger.warn({ err: error }, "Message delete audit failed");
      }
    });

    client.on("messageUpdate", async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
      if (!newMessage.guild || newMessage.author?.bot) return;
      if (oldMessage.content === newMessage.content) return;
      try {
        const author = newMessage.author
          ? {
              name: newMessage.author.tag,
              iconURL: newMessage.author.displayAvatarURL(),
            }
          : undefined;

        const footer = newMessage.author ? `User ID: ${newMessage.author.id}` : undefined;

        const messageUrl = `https://discord.com/channels/${newMessage.guild.id}/${newMessage.channelId}/${newMessage.id}`;

        await sendLog(
          context,
          newMessage.guild.id,
          "MESSAGE_EDIT",
          {
            actor_id: newMessage.author?.id ?? "unknown",
            channel_id: newMessage.channelId,
            target_id: newMessage.id,
            before: oldMessage.content ?? "N/A",
            after: newMessage.content ?? "N/A",
          },
          () => `Message edited in <#${newMessage.channelId}>`,
          {
            author,
            footer,
            title: "Jump to Message",
            url: messageUrl,
            fields: [
              { name: "Before", value: (oldMessage.content ?? "N/A").slice(0, 1024) },
              { name: "After", value: (newMessage.content ?? "N/A").slice(0, 1024) },
            ],
          }
        );
      } catch (error) {
        logger.warn({ err: error }, "Message edit audit failed");
      }
    });

    client.on("guildMemberAdd", async (member: GuildMember) => {
      logger.info({ memberId: member.id, guildId: member.guild.id }, "guildMemberAdd received");
      try {
        const author = {
          name: member.user.tag,
          iconURL: member.user.displayAvatarURL(),
        };

        const footer = `ID: ${member.id}`;

        await sendLog(
          context,
          member.guild.id,
          "MEMBER_JOIN",
          { actor_id: member.id, channel_id: null, target_id: member.id },
          () => `joined the server`,
          { author, footer }
        );
      } catch (error) {
        logger.warn({ err: error }, "Member join audit failed");
      }
    });

    client.on("guildMemberRemove", async (member: GuildMember | PartialGuildMember) => {
      logger.info({ memberId: member.id, guildId: member.guild.id }, "guildMemberRemove received");
      try {
        // partial 멤버는 user가 없을 수 있으므로 안전 처리(예외로 인한 조용한 누락 방지)
        const author = member.user
          ? {
              name: member.user.tag,
              iconURL: member.user.displayAvatarURL(),
            }
          : { name: member.id };

        const footer = `ID: ${member.id}`;

        await sendLog(
          context,
          member.guild.id,
          "MEMBER_LEAVE",
          { actor_id: member.id, channel_id: null, target_id: member.id },
          () => `left the server`,
          { author, footer }
        );
      } catch (error) {
        logger.warn({ err: error }, "Member leave audit failed");
      }
    });

    client.on("guildMemberUpdate", async (oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
      try {
        const author = {
          name: newMember.user.tag,
          iconURL: newMember.user.displayAvatarURL(),
        };

        const footer = `ID: ${newMember.id}`;

        const oldRoles = new Set(oldMember.roles.cache.keys());
        const newRoles = new Set(newMember.roles.cache.keys());

        for (const roleId of newRoles) {
          if (!oldRoles.has(roleId)) {
            await sendLog(
              context,
              newMember.guild.id,
              "ROLE_GRANTED",
              {
                actor_id: newMember.id,
                channel_id: null,
                target_id: roleId,
              },
              () => `was granted role <@&${roleId}>`,
              { author, footer }
            );
          }
        }

        for (const roleId of oldRoles) {
          if (!newRoles.has(roleId)) {
            await sendLog(
              context,
              newMember.guild.id,
              "ROLE_REVOKED",
              {
                actor_id: newMember.id,
                channel_id: null,
                target_id: roleId,
              },
              () => `was revoked role <@&${roleId}>`,
              { author, footer }
            );
          }
        }
      } catch (error) {
        logger.warn({ err: error }, "Role change audit failed");
      }
    });
  },
};

export default auditModule;
