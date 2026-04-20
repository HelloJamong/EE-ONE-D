import { AttachmentBuilder, EmbedBuilder, Message } from "discord.js";
import { load, type CheerioAPI } from "cheerio";
import { TTLCache } from "../../shared/cache.js";
import { BotModule, AppContext } from "../../types.js";

type DcPreview = {
  title: string;
  gallery: string;
  summary?: string;
  imageUrl?: string;
  imageUrls: string[];
  // og:image / twitter:image (dcimg 호스트 검증됨) — 영상 썸네일·GIF 정적 프리뷰 폴백용
  metaImageUrl?: string;
};

const cache = new TTLCache<DcPreview>(60_000);
// 데스크톱: https://gall.dcinside.com/board/view/?id=dcbest&no=412451
// 모바일: https://m.dcinside.com/board/dcbest/412451, https://m.dcinside.com/mini/vtubersnipe/5199795
const DC_REGEX_DESKTOP = /^https?:\/\/(m\.)?gall\.dcinside\.com\/(mgallery\/|mini\/)?board\/view\/?\?[^ \n]+$/i;
const DC_REGEX_MOBILE = /^https?:\/\/m\.dcinside\.com\/(board|mgallery|mini)\/([^\/\s]+)\/(\d+)(\?.*)?$/i;
const CONTENT_IMAGE_SELECTOR = ".write_div img, .writing_view_box img, .gallview_contents img";
const MAX_EMBED_IMAGE_BYTES = 8 * 1024 * 1024;
const DC_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const IGNORED_IMAGE_PATTERNS = [
  /\/loading_/i,
  /\/gallview_loading_/i,
  /\/noimg\.gif/i,
  /\/dcin_logo\./i,
  /\/tit_ngallery\./i,
  /\/kcap_/i,
  /\/fix_nik\.gif/i,
];

function normalizeUrl(raw: string): { fetchUrl: string; displayUrl: string } {
  try {
    const mobileMatch = raw.match(DC_REGEX_MOBILE);
    if (mobileMatch) {
      const [, type, galleryId, postNo] = mobileMatch;
      // 모바일 URL → 데스크톱 URL로 변환 (모바일 HTML 구조가 달라 스크래핑 실패)
      let fetchUrl: string;
      if (type === "mgallery") {
        fetchUrl = `https://gall.dcinside.com/mgallery/board/view/?id=${galleryId}&no=${postNo}`;
      } else if (type === "mini") {
        fetchUrl = `https://gall.dcinside.com/mini/board/view/?id=${galleryId}&no=${postNo}`;
      } else {
        fetchUrl = `https://gall.dcinside.com/board/view/?id=${galleryId}&no=${postNo}`;
      }
      return { fetchUrl, displayUrl: raw };
    }

    // 데스크톱 URL 정규화
    const url = new URL(raw);
    url.hostname = "gall.dcinside.com";
    const fetchUrl = url.toString();
    return { fetchUrl, displayUrl: fetchUrl };
  } catch {
    return { fetchUrl: raw, displayUrl: raw };
  }
}

function isLikelyPostImageHost(hostname: string) {
  return (
    /^dcimg\d*\.dcinside\.co\.kr$/i.test(hostname) ||
    /^dcimg\d*\.dcinside\.com$/i.test(hostname) ||
    hostname === "image.dcinside.com"
  );
}

function normalizeImageUrl(raw: string | undefined, baseUrl: string) {
  const candidate = raw?.trim();
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (!isLikelyPostImageHost(url.hostname)) return undefined;

    const imageUrl = url.toString();
    if (IGNORED_IMAGE_PATTERNS.some((pattern) => pattern.test(imageUrl))) return undefined;
    return imageUrl;
  } catch {
    return undefined;
  }
}

function uniqueDefined(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function extractImageUrls($: CheerioAPI, baseUrl: string) {
  // 갤러리 대문/기본 썸네일이 섞일 수 있는 og:image 대신,
  // 실제 게시글 본문 영역에 포함된 이미지와 원본 첨부파일 링크만 후보로 사용한다.
  // dcimg*.dcinside.co.kr/viewimage.php는 Referer 없이 403을 반환하는 케이스가 있어
  // 이후 다운로드 단계에서 게시글 URL을 Referer로 넣어 재첨부한다.
  const contentImages = $(CONTENT_IMAGE_SELECTOR)
    .toArray()
    .map((element) =>
      normalizeImageUrl(
        $(element).attr("data-original") ||
          $(element).attr("data-src") ||
          $(element).attr("src"),
        baseUrl
      )
    );

  const attachmentImages = $("a[href*='image.dcinside.com/download.php']")
    .toArray()
    .map((element) => normalizeImageUrl($(element).attr("href"), baseUrl));

  return uniqueDefined([...contentImages, ...attachmentImages]);
}

async function scrapePage(url: string): Promise<DcPreview> {
  const res = await fetch(url, { headers: { "User-Agent": DC_USER_AGENT } });
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

  const imageUrls = extractImageUrls($, url);
  const imageUrl = imageUrls[0];

  // og:image / twitter:image → dcimg 호스트 검증 후 메타 이미지로 보관
  // 영상 게시글(본문 이미지 없음)의 썸네일, 대용량 GIF의 정적 프리뷰 폴백으로 사용
  const metaImageUrl =
    normalizeImageUrl($("meta[property='og:image']").attr("content"), url) ??
    normalizeImageUrl($("meta[name='twitter:image']").attr("content"), url);

  return { title: title || "디시인사이드 게시글", gallery, summary, imageUrl, imageUrls, metaImageUrl };
}

function isGenericPreview(preview: DcPreview) {
  return preview.title === "디시인사이드 게시글" || preview.gallery === "디시인사이드";
}

// 일반 갤러리 ↔ 마이너 갤러리 URL 교체 (모바일 /board/ URL은 두 타입 모두 가능)
function alternateGalleryUrl(url: string): string | null {
  if (url.includes("/mgallery/board/view/")) {
    return url.replace("/mgallery/board/view/", "/board/view/");
  }
  if (url.includes("/board/view/") && !url.includes("/mgallery/")) {
    return url.replace("/board/view/", "/mgallery/board/view/");
  }
  return null;
}

async function fetchPreview(url: string, logger: AppContext["logger"]) {
  const cached = cache.get(url);
  if (cached) return cached;

  const preview = await scrapePage(url);

  // 제목/갤러리가 기본값이면 갤러리 타입(일반↔마이너)을 바꿔 재시도
  if (isGenericPreview(preview)) {
    const altUrl = alternateGalleryUrl(url);
    if (altUrl) {
      try {
        const altPreview = await scrapePage(altUrl);
        if (!isGenericPreview(altPreview)) {
          cache.set(url, altPreview);
          logger.debug({ url, altUrl, altPreview }, "Cached dcinside preview via alternate gallery URL");
          return altPreview;
        }
      } catch (err) {
        logger.debug({ err, altUrl }, "Alternate gallery URL also failed");
      }
    }
  }

  cache.set(url, preview);
  logger.debug({ url, preview }, "Cached dcinside preview");
  return preview;
}

function inferImageExtension(contentType: string | null, buffer: Buffer) {
  const normalizedType = contentType?.split(";")[0].trim().toLowerCase();
  if (normalizedType === "image/png") return "png";
  if (normalizedType === "image/jpeg" || normalizedType === "image/jpg") return "jpg";
  if (normalizedType === "image/gif") return "gif";
  if (normalizedType === "image/webp") return "webp";

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "jpg";
  }
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "gif";
  }
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "webp";
  }

  return undefined;
}

async function tryDownloadImage(
  imageUrl: string,
  referer: string,
  logger: AppContext["logger"]
): Promise<{ name: string; sourceUrl: string; attachment: AttachmentBuilder } | "oversized" | undefined> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": DC_USER_AGENT,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: referer,
      },
    });

    if (!res.ok) {
      logger.warn({ imageUrl, status: res.status }, "Failed to download dcinside preview image");
      return undefined;
    }

    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength > MAX_EMBED_IMAGE_BYTES) {
      logger.warn({ imageUrl, contentLength }, "Oversized dcinside preview image; will try meta fallback");
      return "oversized";
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_EMBED_IMAGE_BYTES) {
      logger.warn({ imageUrl, size: buffer.length }, "Oversized dcinside preview image; will try meta fallback");
      return "oversized";
    }

    const extension = inferImageExtension(res.headers.get("content-type"), buffer);
    if (!extension) {
      logger.warn({ imageUrl, contentType: res.headers.get("content-type") }, "Skipping non-image dcinside preview attachment");
      return undefined;
    }

    const name = `dc-preview.${extension}`;
    return { name, sourceUrl: imageUrl, attachment: new AttachmentBuilder(buffer, { name }) };
  } catch (error) {
    logger.warn({ err: error, imageUrl }, "Failed to prepare dcinside preview image attachment");
    return undefined;
  }
}

async function createEmbedImageAttachment(
  imageUrls: string[],
  metaImageUrl: string | undefined,
  referer: string,
  logger: AppContext["logger"]
) {
  let hadOversized = false;

  for (const imageUrl of imageUrls) {
    const result = await tryDownloadImage(imageUrl, referer, logger);
    if (result === "oversized") {
      hadOversized = true;
      continue;
    }
    if (result) return result;
  }

  // 본문 이미지가 없거나(영상 게시글) 모두 용량 초과(대용량 GIF)인 경우
  // og:image / twitter:image 의 정적 썸네일로 폴백
  if ((imageUrls.length === 0 || hadOversized) && metaImageUrl) {
    const result = await tryDownloadImage(metaImageUrl, referer, logger);
    if (result && result !== "oversized") return result;
  }

  return undefined;
}

function buildEmbed(message: Message, url: string, preview: DcPreview, attachmentName?: string) {
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
    embed.setImage(attachmentName ? `attachment://${attachmentName}` : preview.imageUrl);
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

      const { fetchUrl, displayUrl } = normalizeUrl(content);
      try {
        const preview = await fetchPreview(fetchUrl, logger);
        const hasAnyCandidates = preview.imageUrls.length > 0 || !!preview.metaImageUrl;
        const imageAttachment = hasAnyCandidates
          ? await createEmbedImageAttachment(preview.imageUrls, preview.metaImageUrl, fetchUrl, logger)
          : undefined;

        // 첨부 성공 시 attachment:// URL, 실패 시 본문 이미지 URL 직접 사용
        const embedImageName = imageAttachment?.name;
        const embed = buildEmbed(message, displayUrl, preview, embedImageName);

        try {
          await message.channel.send({
            embeds: [embed],
            files: imageAttachment ? [imageAttachment.attachment] : undefined,
          });
        } catch (sendError) {
          if (!imageAttachment) throw sendError;

          logger.warn({ err: sendError }, "Failed to send attached dcinside preview image; retrying with remote image URL");
          await message.channel.send({ embeds: [buildEmbed(message, displayUrl, preview)] });
        }

        try {
          await message.delete();
        } catch (deleteError) {
          logger.warn({ err: deleteError, channelId: message.channelId, authorId: message.author.id }, "Failed to delete original DC message");
        }
      } catch (error) {
        // 미리보기 실패 시 원본 메시지 유지, 아무 동작 하지 않음
        logger.warn({ err: error }, "Failed to fetch dcinside preview");
      }
    });
  },
};

export default dcEmbedModule;
