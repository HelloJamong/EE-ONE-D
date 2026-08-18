import { AttachmentBuilder, EmbedBuilder, Message } from "discord.js";
import { TTLCache } from "../../shared/cache.js";
import { safeEventHandler } from "../../shared/events.js";
import { BotModule, AppContext } from "../../types.js";

type IgPreview = {
  username: string;
  fullName: string;
  caption?: string;
  displayUrl: string;
  isVideo: boolean;
  postUrl: string;
};

// https://www.instagram.com/p/{shortcode}/
// https://www.instagram.com/reel/{shortcode}/
// https://www.instagram.com/reels/{shortcode}/
// https://www.instagram.com/tv/{shortcode}/
// 앱 공유 링크는 "?igsi=..." 대신 "&igsi=..."로 오는 경우가 있어 둘 다 허용
const IG_REGEX = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?([?&][^ \n]*)?$/i;

const IG_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_EMBED_IMAGE_BYTES = 8 * 1024 * 1024;

const previewCache = new TTLCache<IgPreview>(5 * 60_000);

export class IgUnavailableError extends Error {
  constructor(public reason: "transient" | "no_media") {
    super(reason);
  }
}

function extractShortcode(url: string): string | null {
  const match = url.match(IG_REGEX);
  return match ? match[3] : null;
}

export async function fetchPreview(
  shortcode: string,
  postUrl: string,
  logger: AppContext["logger"]
): Promise<IgPreview> {
  const cached = previewCache.get(shortcode);
  if (cached) return cached;

  // Instagram 공유 URL은 /reels/도 쓰지만 oEmbed API는 /reel/만 허용한다.
  const oEmbedPostUrl = postUrl.replace(/instagram\.com\/reels\//i, "instagram.com/reel/");
  const endpoint = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(oEmbedPostUrl)}`;
  const res = await fetch(endpoint, {
    headers: {
      "User-Agent": IG_UA,
      "Accept": "application/json",
      "Accept-Language": "ko-KR,ko;q=0.9",
      "Referer": "https://www.instagram.com/",
    },
  });

  if (res.status === 404) {
    logger.warn({ shortcode }, "Instagram oEmbed found no public media");
    throw new IgUnavailableError("no_media");
  }
  if (!res.ok) {
    logger.warn({ shortcode, status: res.status }, "Instagram oEmbed request failed");
    throw new IgUnavailableError("transient");
  }

  const data = await res.json() as {
    title?: string;
    author_name?: string;
    html?: string;
    thumbnail_url?: string;
  };

  if (!data.author_name || !data.thumbnail_url) {
    logger.warn({ shortcode }, "Instagram oEmbed response is missing required fields");
    throw new IgUnavailableError("transient");
  }

  const permalink = data.html?.match(/data-instgrm-permalink="([^"]+)"/)?.[1] ?? "";
  const preview: IgPreview = {
    username: data.author_name,
    fullName: "",
    caption: data.title?.trim() || undefined,
    displayUrl: data.thumbnail_url,
    isVideo: /instagram\.com\/(reel|reels|tv)\//i.test(permalink || postUrl),
    postUrl,
  };

  previewCache.set(shortcode, preview);
  logger.debug({ shortcode, username: preview.username }, "Cached Instagram preview");
  return preview;
}

async function tryDownloadImage(
  imageUrl: string,
  logger: AppContext["logger"]
): Promise<AttachmentBuilder | undefined> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": IG_UA, "Referer": "https://www.instagram.com/" },
    });
    if (!res.ok) {
      logger.warn({ imageUrl, status: res.status }, "Failed to download Instagram preview image");
      return undefined;
    }
    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength > MAX_EMBED_IMAGE_BYTES) return undefined;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_EMBED_IMAGE_BYTES) return undefined;

    const contentType = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
      "image/webp": "webp", "image/gif": "gif",
    };
    const ext = extMap[contentType] ?? "jpg";
    return new AttachmentBuilder(buffer, { name: `ig-preview.${ext}` });
  } catch (err) {
    logger.warn({ err, imageUrl }, "Failed to prepare Instagram preview image");
    return undefined;
  }
}

function buildEmbed(
  message: Message,
  preview: IgPreview,
  attachmentName?: string
) {
  const igAuthorName = preview.fullName
    ? `${preview.fullName} (@${preview.username})`
    : `@${preview.username}`;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: message.member?.displayName ?? message.author.username,
      iconURL: message.member?.displayAvatarURL({ size: 64 }) ?? message.author.displayAvatarURL({ size: 64 }),
    })
    .setTitle(preview.isVideo ? "Instagram 동영상 보기" : "Instagram 게시물 보기")
    .setURL(preview.postUrl)
    .setFooter({ text: `Instagram · ${igAuthorName}` })
    .setColor(0xe1306c)
    .setTimestamp(message.createdAt);

  if (preview.caption && preview.caption.length > 0) {
    embed.setDescription(preview.caption.slice(0, 300));
  }

  if (preview.displayUrl) {
    embed.setImage(attachmentName ? `attachment://${attachmentName}` : preview.displayUrl);
  }

  return embed;
}

const igEmbedModule: BotModule = {
  name: "igEmbed",
  register: (context: AppContext) => {
    const { client, logger } = context;

    client.on("messageCreate", safeEventHandler(logger, "igEmbed:messageCreate", async (message) => {
      if (!message.guild || message.author.bot) return;
      const content = message.content.trim();

      if (!IG_REGEX.test(content)) return;

      if (content.split(/\s+/).length !== 1) {
        logger.debug({ content }, "IG link ignored: not standalone");
        return;
      }

      const shortcode = extractShortcode(content);
      if (!shortcode) return;

      // 쿼리 파라미터(? 또는 손상된 &) 제거한 clean URL을 postUrl로 사용
      const postUrl = content.split(/[?&]/)[0].replace(/\/$/, "") + "/";

      try {
        const preview = await fetchPreview(shortcode, postUrl, logger);
        const attachment = await tryDownloadImage(preview.displayUrl, logger);
        const embed = buildEmbed(message, preview, attachment?.name ?? undefined);

        try {
          await message.channel.send({
            embeds: [embed],
            files: attachment ? [attachment] : undefined,
          });
        } catch (sendErr) {
          if (!attachment) throw sendErr;
          logger.warn({ err: sendErr }, "Failed to send attached IG image; retrying without attachment");
          await message.channel.send({ embeds: [buildEmbed(message, preview)] });
        }

        try {
          await message.delete();
        } catch (deleteErr) {
          logger.warn({ err: deleteErr }, "Failed to delete original IG message");
        }
      } catch (err) {
        logger.warn({ err, content }, "Failed to fetch Instagram preview");

        const isTransient = !(err instanceof IgUnavailableError) || err.reason === "transient";
        const reason = isTransient
          ? "일시적으로 미리보기를 가져오지 못했어요. 잠시 후 다시 시도해주세요."
          : "비공개 계정, 삭제된 게시물, 또는 로그인·연령 확인이 필요한 게시물이라 미리보기를 가져올 수 없어요.";

        const fallback = new EmbedBuilder()
          .setAuthor({
            name: message.member?.displayName ?? message.author.username,
            iconURL: message.member?.displayAvatarURL({ size: 64 }) ?? message.author.displayAvatarURL({ size: 64 }),
          })
          .setDescription(`${reason}\n\n[인스타그램에서 직접 보기](${postUrl})`)
          .setColor(0x8e8e8e);

        try {
          await message.channel.send({ embeds: [fallback] });
          // 일시적 오류는 재시도로 풀릴 수 있으니 원본 링크 메시지를 보존 (재전송 불필요)
          if (!isTransient) {
            await message.delete();
          }
        } catch (fallbackErr) {
          logger.warn({ err: fallbackErr }, "Failed to send IG fallback notice");
        }
      }
    }));
  },
};

export default igEmbedModule;
