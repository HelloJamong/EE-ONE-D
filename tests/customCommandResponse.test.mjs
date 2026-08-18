import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCustomCommandResponses } from "../dist/shared/customCommandResponse.js";
import { validateResponse } from "../dist/modules/customCommands/validator.js";

test("plain responses remain independent random choices", () => {
  assert.deepEqual(parseCustomCommandResponses("안녕하세요|||반갑습니다"), [
    { type: "text", content: "안녕하세요" },
    { type: "text", content: "반갑습니다" },
  ]);
});

test("EMBED title and description stay grouped", () => {
  assert.deepEqual(parseCustomCommandResponses("EMBED:서버 점검 안내|||오늘 밤 12시에 점검합니다."), [
    { type: "embed", title: "서버 점검 안내", description: "오늘 밤 12시에 점검합니다." },
  ]);
});

test("multiple embeds become independent grouped choices", () => {
  assert.deepEqual(
    parseCustomCommandResponses("EMBED:명언 1|||노력은 배신하지 않는다|||EMBED:명언 2|||오늘 할 일을 미루지 말라"),
    [
      { type: "embed", title: "명언 1", description: "노력은 배신하지 않는다" },
      { type: "embed", title: "명언 2", description: "오늘 할 일을 미루지 말라" },
    ],
  );
});

test("malformed embeds are rejected and long plain messages remain valid", () => {
  assert.equal(validateResponse("EMBED:제목만").valid, false);
  assert.equal(validateResponse("x".repeat(4000)).valid, true);
  assert.equal(validateResponse("EMBED:제목|||본문").valid, true);
});
