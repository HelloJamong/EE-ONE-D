# Implementation Plan: Instagram 임베드 모듈 (igEmbed)

## Overview

Discord 채널에 Instagram 링크가 단독으로 올라오면 봇이 원본 메시지를 삭제하고 임베드로 교체한다.
게시물(이미지)은 첫 번째 이미지와 작성자·캡션을, 릴스(영상)는 영상 썸네일과 작성자·캡션을 표시한다.
기존 dcEmbed 모듈과 동일한 BotModule 패턴으로 구현하며, 신규 npm 의존성은 추가하지 않는다.

## Architecture Decisions

- **Instagram 내부 GraphQL 사용**: `POST /graphql/query`, `doc_id: 9510064595728286`로 로그인 없이 공개 게시물 데이터 조회 가능. 실제 URL 4개로 동작 검증 완료.
- **의존성 없음**: Node.js 내장 `fetch` + 기존 `TTLCache`, `discord.js`만 사용.
- **CSRF 토큰 모듈 캐싱**: `GET instagram.com`으로 획득, 30분 TTL 모듈 변수에 보관. 요청마다 재획득하지 않음.
- **이미지 첨부 방식**: CDN URL(`scontent-icn2-1.cdninstagram.com`)에서 이미지를 다운로드해 Discord `AttachmentBuilder`로 첨부. CDN URL 만료 대비 preview 캐시 TTL 5분.
- **조용한 실패**: API 호출 실패·비공개 계정·doc_id 변경 등 모든 예외 상황에서 원본 메시지 유지, WARN 로그만 기록.

## Dependency Graph

```
[Task 1] URL regex + shortcode 추출 + IgPreview 타입 + BotModule 뼈대
    │
    └── [Task 2] CSRF 토큰 캐싱 + GraphQL 클라이언트 + fetchPreview
            │
            └── [Task 3] 이미지 다운로드 + Embed 빌더 + messageCreate 이벤트 연결
                    │
                    └── [Task 4] src/index.ts 모듈 등록
```

## Verified Facts (실제 테스트 결과)

| 항목 | 결과 |
|------|------|
| CSRF 토큰 획득 | ✅ HTTP 200, csrftoken 쿠키 정상 반환 |
| GraphQL 호출 (doc_id: 9510064595728286) | ✅ 4개 실제 URL 모두 데이터 반환 |
| `?utm_source`, `?igsh` 파라미터 | ✅ shortcode 추출에 영향 없음 |
| 동일 shortcode `/p/` + `/reel/` | ✅ 동일 데이터 반환, 처리 불필요 |
| `display_url` 다운로드 | ✅ 72.8 KB JPEG, HTTP 200 (Korean CDN) |
| 릴스 썸네일 | ✅ `is_video: true`일 때 `display_url`이 첫 프레임 |

---

## Task List

### Phase 1: Foundation

---

#### Task 1: URL 감지 + 타입 정의 + 모듈 뼈대

**Description:** `src/modules/igEmbed/index.ts`를 생성하고 Instagram URL 정규식, shortcode 추출 함수, `IgPreview` 타입, 빈 `BotModule` 객체를 작성한다. 빌드가 통과하는 최소 뼈대.

**Acceptance criteria:**
- [ ] `IG_REGEX`가 아래 4가지 URL 형식을 모두 감지함
  - `https://www.instagram.com/p/{shortcode}/`
  - `https://www.instagram.com/reel/{shortcode}/`
  - `https://www.instagram.com/reels/{shortcode}/`
  - `https://www.instagram.com/tv/{shortcode}/`
- [ ] `?utm_source=...`, `?igsh=...` 등 쿼리 파라미터가 포함된 URL도 감지됨
- [ ] `extractShortcode(url)` 이 shortcode 문자열 또는 `null` 반환
- [ ] `IgPreview` 타입: `username`, `fullName`, `caption?`, `displayUrl`, `isVideo`, `postUrl` 필드 포함
- [ ] `igEmbedModule` 이 `BotModule` 인터페이스를 충족하는 객체

**Verification:**
- [ ] `npm run build` 성공

**Dependencies:** None

**Files likely touched:**
- `src/modules/igEmbed/index.ts` (신규)

**Estimated scope:** Small

---

#### Task 2: CSRF 토큰 캐싱 + GraphQL 클라이언트

**Description:** Instagram 내부 GraphQL API를 호출해 `IgPreview`를 반환하는 `fetchPreview(shortcode)` 함수를 구현한다. CSRF 토큰은 30분 TTL로 모듈 레벨 변수에 캐싱한다. 게시물 캐시는 `TTLCache<IgPreview>`(TTL 5분)로 관리한다.

**Acceptance criteria:**
- [ ] `getCSRFToken()` 이 `instagram.com`에서 `csrftoken` 쿠키를 추출하고 30분 동안 재사용
- [ ] `fetchPreview('DYpaDjwMGys')` 호출 시 `username: 'no.jumpscares'`, `isVideo: true`, `displayUrl` 있음
- [ ] `fetchPreview('DY0tlzMGHEF')` 호출 시 `username: 'asuskorea'`, `isVideo: false`, `displayUrl` 있음
- [ ] `xdt_shortcode_media === null`이면 `WARN` 로그 + Error throw (원본 메시지 보존용)
- [ ] 동일 shortcode 5분 내 재요청 시 캐시에서 반환

**Verification:**
- [ ] `npm run build` 성공
- [ ] 임시 스크립트로 위 두 shortcode에 대해 API 응답 확인

**Dependencies:** Task 1

**Files likely touched:**
- `src/modules/igEmbed/index.ts`

**Estimated scope:** Small

---

### Checkpoint: Phase 1 완료

- [ ] `npm run build` 성공
- [ ] 실제 shortcode 2개(`DYpaDjwMGys`, `DY0tlzMGHEF`)로 API 반환값 검증
- [ ] 이후 Phase 2 진행

---

### Phase 2: Core Feature

---

#### Task 3: 이미지 다운로드 + 임베드 빌더 + messageCreate 이벤트

**Description:** `display_url`에서 이미지를 다운로드해 `AttachmentBuilder`로 만들고, Discord 임베드를 구성한 뒤 `messageCreate` 이벤트에서 단독 Instagram 링크를 감지해 처리하는 전체 흐름을 완성한다.

임베드 레이아웃:
```
author : {fullName} (@{username})  →  https://www.instagram.com/{username}/
description : caption (300자 truncate, 없으면 생략)
image  : attachment://{name}  (다운로드 실패 시 displayUrl 직접)
footer : "Instagram"
color  : 0xE1306C
timestamp : message.createdAt
```

**Acceptance criteria:**
- [ ] `tryDownloadImage(url)`: 이미지 다운로드 성공 시 `AttachmentBuilder` 반환, 8 MB 초과 시 `undefined`
- [ ] `buildEmbed(message, url, preview, attachmentName?)` 가 위 레이아웃대로 `EmbedBuilder` 반환
- [ ] `messageCreate` 핸들러:
  - 봇 메시지 무시
  - `content.trim().split(/\s+/).length === 1` 조건 (단독 링크만 처리)
  - 처리 성공 시 임베드 전송 후 원본 메시지 삭제
  - 이미지 첨부 전송 실패 시 URL 직접 사용으로 재시도
  - 모든 예외는 WARN 로그 + 원본 메시지 유지

**Verification:**
- [ ] `npm run build` 성공

**Dependencies:** Task 2

**Files likely touched:**
- `src/modules/igEmbed/index.ts`

**Estimated scope:** Medium

---

#### Task 4: 모듈 등록

**Description:** `src/index.ts`에 `igEmbedModule`을 import하고 `modules` 배열에 추가한다.

**Acceptance criteria:**
- [ ] `igEmbedModule`이 `dcEmbedModule` 바로 다음에 위치
- [ ] `npm run build` 성공
- [ ] 봇 기동 시 에러 없음

**Verification:**
- [ ] `npm run build` 성공
- [ ] `npm start` 또는 Docker 기동 후 정상 실행 확인

**Dependencies:** Task 3

**Files likely touched:**
- `src/index.ts`

**Estimated scope:** XS

---

### Checkpoint: Phase 2 완료 (최종)

- [ ] `npm run build` 성공
- [ ] 실제 Discord 환경에서 아래 케이스 확인:
  - [ ] `https://www.instagram.com/reels/DYpaDjwMGys/` → 릴스 썸네일 + 작성자 + 캡션
  - [ ] `https://www.instagram.com/p/DY0tlzMGHEF/?utm_source=...` → 이미지 + 작성자 + 캡션
  - [ ] 텍스트와 함께 있는 링크 → 무반응
  - [ ] 원본 메시지 삭제 확인

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `doc_id` 변경 | High | `xdt_shortcode_media === null` 시 WARN 로그 명시. 변경 감지 즉시 상수 수정으로 복구 |
| CDN URL 만료 | Low | preview 캐시 TTL 5분으로 짧게 유지 |
| Rate limit (429) | Medium | 조용한 실패로 원본 유지. 서버 단위 요청량이 많지 않으므로 허용 범위 내 |
| 비공개 계정 | Low | `null` 반환과 동일하게 처리 |

## Open Questions

없음. 실제 URL 테스트로 모든 전제가 검증됨.
