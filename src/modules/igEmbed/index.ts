import { AttachmentBuilder, EmbedBuilder, Message } from "discord.js";
import { TTLCache } from "../../shared/cache.js";
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
const IG_REGEX = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?(\?[^ \n]*)?$/i;

const IG_DOC_ID = "9510064595728286";
const IG_APP_ID = "936619743392459";
const IG_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_EMBED_IMAGE_BYTES = 8 * 1024 * 1024;

const previewCache = new TTLCache<IgPreview>(5 * 60_000);

let csrfCache: { token: string; cookies: string; expiresAt: number } | null = null;

function extractShortcode(url: string): string | null {
  const match = url.match(IG_REGEX);
  return match ? match[3] : null;
}

async function getCSRFToken(): Promise<{ token: string; cookies: string }> {
  if (csrfCache && Date.now() < csrfCache.expiresAt) {
    return { token: csrfCache.token, cookies: csrfCache.cookies };
  }
  const res = await fetch("https://www.instagram.com/", {
    headers: { "User-Agent": IG_UA },
  });
  if (!res.ok) throw new Error(`Failed to fetch CSRF token: ${res.status}`);
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const csrfCookie = setCookies.find((c) => c.startsWith("csrftoken="));
  if (!csrfCookie) throw new Error("CSRF token not found in response headers");
  const token = csrfCookie.split(";")[0].replace("csrftoken=", "");
  const cookies = setCookies.map((c) => c.split(";")[0]).join("; ");
  csrfCache = { token, cookies, expiresAt: Date.now() + 30 * 60_000 };
  return { token, cookies };
}

async function fetchPreview(shortcode: string, postUrl: string, logger: AppContext["logger"]): Promise<IgPreview> {
  const cached = previewCache.get(shortcode);
  if (cached) return cached;

  const { token, cookies } = await getCSRFToken();

  const body = new URLSearchParams({
    variables: JSON.stringify({
      shortcode,
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null,
    }),
    doc_id: IG_DOC_ID,
  });

  const res = await fetch("https://www.instagram.com/graphql/query", {
    method: "POST",
    headers: {
      "X-CSRFToken": token,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": IG_UA,
      "Accept": "*/*",
      "Accept-Language": "ko-KR,ko;q=0.9",
      "Origin": "https://www.instagram.com",
      "Referer": "https://www.instagram.com/",
      "Cookie": cookies,
      "X-IG-App-ID": IG_APP_ID,
    },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Instagram GraphQL request failed: ${res.status}`);

  const data = await res.json() as {
    data?: { xdt_shortcode_media?: Record<string, unknown> | null };
  };
  const media = data?.data?.xdt_shortcode_media as Record<string, unknown> | null | undefined;

  if (!media) {
    logger.warn({ shortcode }, "Instagram media null — private account, deleted post, or doc_id changed");
    throw new Error("Instagram media not available");
  }

  const owner = media.owner as Record<string, unknown>;
  const caption = (media.edge_media_to_caption as { edges?: Array<{ node?: { text?: string } }> })
    ?.edges?.[0]?.node?.text;

  const preview: IgPreview = {
    username: String(owner?.username ?? ""),
    fullName: String(owner?.full_name ?? ""),
    caption: caption?.trim() || undefined,
    displayUrl: String(media.display_url ?? ""),
    isVideo: Boolean(media.is_video),
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
  const profileUrl = `https://www.instagram.com/${preview.username}/`;
  const authorName = preview.fullName
    ? `${preview.fullName} (@${preview.username})`
    : `@${preview.username}`;

  const embed = new EmbedBuilder()
    .setAuthor({ name: authorName, url: profileUrl })
    .setURL(preview.postUrl)
    .setFooter({ text: "Instagram" })
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

    client.on("messageCreate", async (message) => {
      if (!message.guild || message.author.bot) return;
      const content = message.content.trim();

      if (!IG_REGEX.test(content)) return;

      if (content.split(/\s+/).length !== 1) {
        logger.debug({ content }, "IG link ignored: not standalone");
        return;
      }

      const shortcode = extractShortcode(content);
      if (!shortcode) return;

      // 쿼리 파라미터 제거한 clean URL을 postUrl로 사용
      const postUrl = content.split("?")[0].replace(/\/$/, "") + "/";

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
      }
    });
  },
};

export default igEmbedModule;
