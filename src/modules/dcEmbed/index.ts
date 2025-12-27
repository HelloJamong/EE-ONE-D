import { EmbedBuilder } from "discord.js";
import { load } from "cheerio";
import { TTLCache } from "../../shared/cache.js";
import { BotModule, AppContext } from "../../types.js";

const cache = new TTLCache<{ title: string; gallery: string; image?: string; summary?: string }>(60_000);
const DC_REGEX = /^https?:\/\/(m\.)?gall\.dcinside\.com\/board\/view\?[^ \n]+$/i;

function normalizeUrl(raw: string) {
  try {
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

  const res = await fetch(url, { headers: { "User-Agent": "EE-ONE-D bot" } });
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`);
  const html = await res.text();
  const $ = load(html);
  const title = $("meta[property='og:title']").attr("content") || $("title").text();
  const gallery = $("meta[name='subject']").attr("content") || $("meta[property='og:site_name']").attr("content") || "dcinside";
  const image = $("meta[property='og:image']").attr("content") || undefined;
  const summary =
    $("meta[property='og:description']").attr("content") ||
    $("meta[name='description']").attr("content") ||
    undefined;

  const preview = { title: title?.trim() ?? "디시인사이드 게시글", gallery: gallery.trim(), image, summary };
  cache.set(url, preview);
  logger.debug({ url }, "Cached dcinside preview");
  return preview;
}

const dcEmbedModule: BotModule = {
  name: "dcEmbed",
  register: (context: AppContext) => {
    const { client, logger } = context;
    client.on("messageCreate", async (message) => {
      if (!message.guild || message.author.bot) return;
      const content = message.content.trim();
      if (!DC_REGEX.test(content)) return;
      // 링크만 단독으로 있을 때만 동작
      if (content.split(/\s+/).length !== 1) return;

      const url = normalizeUrl(content);
      try {
        const preview = await fetchPreview(url, logger);
        const embed = new EmbedBuilder()
          .setTitle(preview.title)
          .setURL(url)
          .setDescription(preview.summary?.slice(0, 200) ?? "게시글 미리보기")
          .addFields({ name: "갤러리", value: preview.gallery })
          .setColor(0x0096ff);
        if (preview.image) embed.setImage(preview.image);

        await message.delete();
        await message.channel.send({ embeds: [embed] });
      } catch (error) {
        logger.warn({ err: error }, "Failed to fetch dcinside preview");
        const embed = new EmbedBuilder()
          .setTitle("디시인사이드 링크")
          .setURL(url)
          .setDescription("미리보기를 가져오지 못했습니다.")
          .setColor(0xffa500);
        await message.channel.send({ embeds: [embed] });
      }
    });
  },
};

export default dcEmbedModule;
