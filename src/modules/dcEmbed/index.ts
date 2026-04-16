import { EmbedBuilder, Message } from "discord.js";
import { load, type CheerioAPI } from "cheerio";
import { TTLCache } from "../../shared/cache.js";
import { BotModule, AppContext } from "../../types.js";

type DcPreview = {
  title: string;
  gallery: string;
  summary?: string;
  imageUrl?: string;
};

const cache = new TTLCache<DcPreview>(60_000);
// 데스크톱: https://gall.dcinside.com/board/view/?id=dcbest&no=412451
// 모바일: https://m.dcinside.com/board/dcbest/412451, https://m.dcinside.com/mini/vtubersnipe/5199795
const DC_REGEX_DESKTOP = /^https?:\/\/(m\.)?gall\.dcinside\.com\/(mgallery\/|mini\/)?board\/view\/?\?[^ \n]+$/i;
const DC_REGEX_MOBILE = /^https?:\/\/m\.dcinside\.com\/(board|mgallery|mini)\/([^\/\s]+)\/(\d+)(\?.*)?$/i;
const CONTENT_IMAGE_SELECTOR = ".write_div img, .writing_view_box img, .gallview_contents img";
const IGNORED_IMAGE_PATTERNS = [
  /\/loading_/i,
  /\/gallview_loading_/i,
  /\/noimg\.gif/i,
  /\/dcin_logo\./i,
  /\/tit_ngallery\./i,
  /\/kcap_/i,
];

function normalizeUrl(raw: string) {
  try {
    const mobileMatch = raw.match(DC_REGEX_MOBILE);
    if (mobileMatch) {
      // 모바일 URL은 그대로 사용
      return raw;
    }

    // 데스크톱 URL 정규화
    const url = new URL(raw);
    url.hostname = "gall.dcinside.com";
    return url.toString();
  } catch {
    return raw;
  }
}

function normalizeImageUrl(raw: string | undefined, baseUrl: string) {
  const candidate = raw?.trim();
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

    const imageUrl = url.toString();
    if (IGNORED_IMAGE_PATTERNS.some((pattern) => pattern.test(imageUrl))) return undefined;
    return imageUrl;
  } catch {
    return undefined;
  }
}

function extractFirstImageUrl($: CheerioAPI, baseUrl: string) {
  // 갤러리 대문/기본 썸네일이 섞일 수 있는 og:image 대신,
  // 실제 게시글 본문 영역에 포함된 첫 번째 이미지만 사용한다.
  return $(CONTENT_IMAGE_SELECTOR)
    .toArray()
    .map((element) =>
      normalizeImageUrl(
        $(element).attr("data-original") ||
          $(element).attr("data-src") ||
          $(element).attr("src"),
        baseUrl
      )
    )
    .find((imageUrl): imageUrl is string => Boolean(imageUrl));
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
  const imageUrl = extractFirstImageUrl($, url);

  const preview = { title: title || "디시인사이드 게시글", gallery, summary, imageUrl };
  cache.set(url, preview);
  logger.debug({ url, preview }, "Cached dcinside preview");
  return preview;
}

function buildEmbed(message: Message, url: string, preview: DcPreview) {
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

  if (preview.imageUrl) {
    embed.setImage(preview.imageUrl);
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
