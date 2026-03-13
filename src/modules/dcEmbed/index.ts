import { EmbedBuilder, Message } from "discord.js";
import { load } from "cheerio";
import { TTLCache } from "../../shared/cache.js";
import { BotModule, AppContext } from "../../types.js";

const cache = new TTLCache<{ title: string; gallery: string; summary?: string }>(60_000);
// 데스크톱: https://gall.dcinside.com/board/view/?id=dcbest&no=412451
// 모바일: https://m.dcinside.com/board/dcbest/412451 또는 https://m.dcinside.com/board/eft/2730298?recommend=1
const DC_REGEX_DESKTOP = /^https?:\/\/(m\.)?gall\.dcinside\.com\/(mgallery\/|mini\/)?board\/view\/?\?[^ \n]+$/i;
const DC_REGEX_MOBILE = /^https?:\/\/m\.dcinside\.com\/board\/([^\/\s]+)\/(\d+)(\?.*)?$/i;

function normalizeUrl(raw: string) {
  try {
    // 모바일 URL -> 데스크톱 URL 변환
    const mobileMatch = raw.match(DC_REGEX_MOBILE);
    if (mobileMatch) {
      const [, galleryId, postNo] = mobileMatch;
      return `https://gall.dcinside.com/board/view/?id=${galleryId}&no=${postNo}`;
    }

    // 데스크톱 URL 정규화
    const url = new URL(raw);
    url.hostname = "gall.dcinside.com";
    return url.toString();
  } catch {
    return raw;
  }
}

async function fetchPreview(url: string, logger: AppContext["logger"]) {
  const cached = cache.get(url);
  if (cached) return cached;

  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`);
  const html = await res.text();
  const $ = load(html);

  // og:title은 "글제목 - 갤러리명" 형식이므로 분리
  const rawTitle = $("meta[property='og:title']").attr("content") || $("title").text() || "";
  const titleParts = rawTitle.split(" - ");
  const title = titleParts.length > 1 ? titleParts.slice(0, -1).join(" - ").trim() : rawTitle.trim();

  // 갤러리명 추출: og:title 마지막 부분 또는 메타데이터에서
  const galleryFromTitle = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : null;
  const gallery = galleryFromTitle ||
    $("meta[name='subject']").attr("content")?.trim() ||
    $(".gallname").text()?.trim() ||
    $("meta[property='og:site_name']").attr("content")?.trim() ||
    "디시인사이드";

  const summary =
    $("meta[property='og:description']").attr("content") ||
    $("meta[name='description']").attr("content") ||
    undefined;

  const preview = { title: title || "디시인사이드 게시글", gallery, summary };
  cache.set(url, preview);
  logger.debug({ url, preview }, "Cached dcinside preview");
  return preview;
}

function buildEmbed(message: Message, url: string, preview: { title: string; gallery: string; summary?: string }) {
  const embed = new EmbedBuilder()
    .setAuthor({
      name: message.member?.displayName ?? message.author.username,
      iconURL: message.member?.displayAvatarURL({ size: 64 }) ?? message.author.displayAvatarURL({ size: 64 }),
    })
    .setTitle(preview.title)
    .setURL(url)
    .setFooter({ text: preview.gallery })
    .setColor(message.member?.displayColor ?? 0x0096ff)
    .setTimestamp(message.createdAt);

  // summary가 있을 때만 description 설정 (빈 문자열은 에러 발생)
  if (preview.summary && preview.summary.trim().length > 0) {
    embed.setDescription(preview.summary.slice(0, 300));
  }

  return embed;
}

const dcEmbedModule: BotModule = {
  name: "dcEmbed",
  register: (context: AppContext) => {
    const { client, logger } = context;
    client.on("messageCreate", async (message) => {
      if (!message.guild || message.author.bot) return;
      const content = message.content.trim();

      // 디버그 로그
      const isDesktopMatch = DC_REGEX_DESKTOP.test(content);
      const isMobileMatch = DC_REGEX_MOBILE.test(content);

      if (!isDesktopMatch && !isMobileMatch) return;

      // 링크만 단독으로 있을 때만 동작
      const wordCount = content.split(/\s+/).length;
      if (wordCount !== 1) {
        logger.debug({ content, wordCount }, "DC link ignored: not standalone");
        return;
      }

      logger.debug({ content, isDesktopMatch, isMobileMatch }, "Processing DC link");

      const url = normalizeUrl(content);
      try {
        const preview = await fetchPreview(url, logger);
        const embed = buildEmbed(message, url, preview);

        try {
          await message.delete();
        } catch (deleteError) {
          logger.warn({ err: deleteError, channelId: message.channelId, authorId: message.author.id }, "Failed to delete original DC message");
        }

        await message.channel.send({ embeds: [embed] });
      } catch (error) {
        // 미리보기 실패 시 원본 메시지 유지, 아무 동작 하지 않음
        logger.warn({ err: error }, "Failed to fetch dcinside preview");
      }
    });
  },
};

export default dcEmbedModule;
