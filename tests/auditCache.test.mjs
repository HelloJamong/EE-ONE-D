import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { afterEach, test } from "node:test";
import auditModule from "../dist/modules/audit/index.js";
import { BoundedBufferCache } from "../dist/shared/cache.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("bounded image cache expires entries and releases them during pruning", () => {
  let now = 1_000;
  const cache = new BoundedBufferCache(100, 50, () => now);
  cache.set("message", [{ name: "image.png", data: Buffer.alloc(20) }]);

  now = 1_051;
  assert.equal(cache.pruneExpired(), 1);
  assert.equal(cache.take("message"), undefined);
});

test("bounded image cache evicts oldest entries and rejects oversized values", () => {
  const cache = new BoundedBufferCache(10);
  const file = (name, bytes) => ({ name, data: Buffer.alloc(bytes) });
  cache.set("a", [file("a", 4)]);
  cache.set("b", [file("b", 4)]);
  cache.set("c", [file("c", 4)]);

  assert.equal(cache.take("a"), undefined);
  assert.ok(cache.take("b"));
  assert.ok(cache.take("c"));

  cache.set("oversized", [file("oversized", 11)]);
  assert.equal(cache.take("oversized"), undefined);
});

test("audit image caching skips downloads when the guild has no log channel", async () => {
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(Buffer.alloc(10));
  };

  const client = new EventEmitter();
  const settingsLookups = [];
  auditModule.register({
    client,
    db: {
      guild_settings: {
        findUnique: async (query) => {
          settingsLookups.push(query);
          return { log_channel_id: null };
        },
      },
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  });

  const attachment = {
    contentType: "image/png",
    size: 10,
    url: "https://cdn.example.com/image.png",
    name: "image.png",
  };
  const attachments = new Map([["attachment", attachment]]);
  attachments.filter = (predicate) => new Map(
    [...attachments].filter(([, value]) => predicate(value)),
  );

  client.emit("messageCreate", {
    id: "message-1",
    guild: { id: "guild-1" },
    author: { bot: false },
    attachments,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(settingsLookups.length, 1);
  assert.equal(fetchCount, 0);
});
