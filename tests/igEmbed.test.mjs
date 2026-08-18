import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchPreview, IgUnavailableError } from "../dist/modules/igEmbed/index.js";

const originalFetch = globalThis.fetch;
const logger = {
  debug() {},
  warn() {},
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("public oEmbed data is converted to an Instagram preview", async () => {
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      title: "한강 수영장서 '여성 수영복' 입은 남성 논란",
      author_name: "mbcnews_official",
      html: '<blockquote data-instgrm-permalink="https://www.instagram.com/reel/DbmTdVcEbRB/"></blockquote>',
      thumbnail_url: "https://cdn.example.com/thumbnail.jpg",
    });
  };

  const preview = await fetchPreview(
    "DbmTdVcEbRB",
    "https://www.instagram.com/reels/DbmTdVcEbRB/",
    logger,
  );

  assert.match(requestedUrl, /\/api\/v1\/oembed\/\?url=/);
  assert.match(decodeURIComponent(requestedUrl), /instagram\.com\/reel\/DbmTdVcEbRB\//);
  assert.doesNotMatch(decodeURIComponent(requestedUrl), /instagram\.com\/reels\//);
  assert.equal(preview.username, "mbcnews_official");
  assert.equal(preview.caption, "한강 수영장서 '여성 수영복' 입은 남성 논란");
  assert.equal(preview.displayUrl, "https://cdn.example.com/thumbnail.jpg");
  assert.equal(preview.isVideo, true);
});

test("login or rate-limit responses are transient, not private/deleted", async () => {
  globalThis.fetch = async () => Response.json(
    { message: "Please wait a few minutes", require_login: true, status: "fail" },
    { status: 401 },
  );

  await assert.rejects(
    fetchPreview("TRANSIENT01", "https://www.instagram.com/p/TRANSIENT01/", logger),
    (error) => error instanceof IgUnavailableError && error.reason === "transient",
  );
});

test("a 404 oEmbed response is classified as unavailable media", async () => {
  globalThis.fetch = async () => new Response("No Media Match", { status: 404 });

  await assert.rejects(
    fetchPreview("NOTFOUND001", "https://www.instagram.com/p/NOTFOUND001/", logger),
    (error) => error instanceof IgUnavailableError && error.reason === "no_media",
  );
});
