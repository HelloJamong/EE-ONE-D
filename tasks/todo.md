# igEmbed 구현 태스크

## Phase 1: Foundation

- [x] Task 1: URL 감지 + 타입 정의 + 모듈 뼈대
  - `src/modules/igEmbed/index.ts` 신규 생성
  - IG_REGEX (p/reel/reels/tv), extractShortcode(), IgPreview 타입, BotModule 뼈대
  - Verify: URL 정규식 9/9 통과

- [x] Task 2: CSRF 토큰 캐싱 + GraphQL 클라이언트
  - getCSRFToken() (30분 TTL), fetchPreview() (5분 TTL 캐시)
  - Verify: shortcode `DYpaDjwMGys`(릴스), `DY0tlzMGHEF`(이미지) 실제 API 응답 2/2 통과

### Checkpoint 1 ✅
- [x] build 통과
- [x] 실제 API 호출 검증

## Phase 2: Core Feature

- [x] Task 3: 이미지 다운로드 + 임베드 빌더 + messageCreate 이벤트
  - tryDownloadImage(), buildEmbed(), register() 이벤트 핸들러
  - Verify: `npm run build` 성공

- [x] Task 4: 모듈 등록
  - `src/index.ts`에 igEmbedModule 추가
  - Verify: `npm run build` + 봇 기동 확인

### Checkpoint 2 (최종)
- [ ] Discord에서 실제 Instagram 링크 임베드 동작 확인
- [ ] 원본 메시지 삭제 확인
