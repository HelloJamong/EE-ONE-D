import assert from "node:assert/strict";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private ttlMs: number) {}

  set(key: string, value: T) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }
}

export type BufferFile = { name: string; data: Buffer };

// 메시지 ID -> 이미지 버퍼들. 총 바이트가 상한을 넘으면 가장 오래된 항목부터 축출하는 LRU.
// Map의 삽입 순서 보존을 이용해 oldest를 찾는다.
export class BoundedBufferCache {
  private store = new Map<string, { files: BufferFile[]; bytes: number }>();
  private totalBytes = 0;

  constructor(private maxBytes: number) {}

  set(key: string, files: BufferFile[]) {
    this.delete(key); // 동일 키 갱신 시 기존 바이트 먼저 회수
    const bytes = files.reduce((sum, f) => sum + f.data.length, 0);
    if (bytes <= 0 || bytes > this.maxBytes) return; // 단일 항목이 상한보다 크면 캐시하지 않음
    while (this.totalBytes + bytes > this.maxBytes) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
    this.store.set(key, { files, bytes });
    this.totalBytes += bytes;
  }

  // 조회 후 즉시 제거(소비) — 삭제 로그를 남긴 뒤 메모리를 바로 회수한다.
  take(key: string): BufferFile[] | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    this.delete(key);
    return entry.files;
  }

  private delete(key: string) {
    const entry = this.store.get(key);
    if (!entry) return;
    this.totalBytes -= entry.bytes;
    this.store.delete(key);
  }
}

// self-check: `node dist/shared/cache.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  const c = new BoundedBufferCache(10);
  const file = (name: string, n: number): BufferFile => ({ name, data: Buffer.alloc(n) });
  c.set("a", [file("a", 4)]);
  c.set("b", [file("b", 4)]);
  c.set("c", [file("c", 4)]); // 총 12 > 10 → 가장 오래된 "a" 축출
  assert.equal(c.take("a"), undefined, "oldest entry should be evicted");
  assert.ok(c.take("b"), "b should remain");
  assert.ok(c.take("c"), "c should remain");
  c.set("big", [file("big", 99)]); // 상한 초과 단일 항목은 캐시 안 함
  assert.equal(c.take("big"), undefined, "oversized entry should not be cached");
  console.log("BoundedBufferCache self-check passed");
}
