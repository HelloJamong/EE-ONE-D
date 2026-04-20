# Changelog

## [26.04.07] - 2026-04-20

### Fixed
- 디시인사이드 영상·GIF 게시글 임베드 이미지 개선
  - 영상 게시글: 본문에 이미지가 없을 경우 `og:image`/`twitter:image` 영상 썸네일을 폴백으로 표시
  - GIF 게시글: 본문 GIF가 8MB 초과 시 DC가 제공하는 정적 썸네일(`twitter:image`)로 폴백
  - `og:image`/`twitter:image`는 dcimg 호스트 검증을 통과한 경우에만 사용 (갤러리 대문 이미지 오삽입 방지)
  - 본문 이미지가 성공적으로 첨부된 경우 기존 동작 유지 (폴백 미사용)

## [26.04.06] - 2026-04-19

### Fixed
- 디시인사이드 마이너 갤러리 모바일 링크 임베드 오류 수정
  - 모바일 `/board/` 경로는 일반 갤러리와 마이너 갤러리 모두 사용하는 공용 형식
  - 마이너 갤러리를 일반 갤러리 URL로 변환하면 빈 응답 → 제목·갤러리가 기본값으로 표시되던 문제 해결
  - 스크래핑 결과가 기본값("디시인사이드 게시글" / "디시인사이드")일 경우 `/board/view/` ↔ `/mgallery/board/view/` 교체 후 재시도

## [26.04.05] - 2026-04-17

### Removed
- `/noti vote` 투표 기능 전체 제거
  - 동작 불안정으로 인해 `poll.ts`, 관련 모달/핸들러 코드 삭제
  - `poll_messages`, `poll_votes` DB 테이블 및 Prisma 스키마 제거

### Database
- `poll_messages`, `poll_votes` 테이블 삭제 마이그레이션 추가

## [26.04.04] - 2026-04-17

### Fixed
- 봇 컨테이너 재시작 루프 해결 (Prisma 마이그레이션 실패 상태 resolve)
  - `poll_messages`, `poll_votes` 테이블이 DB에 이미 존재한 상태에서 마이그레이션 재실행 시 `42P07: relation already exists` 에러로 실패 기록
  - `_prisma_migrations` 테이블의 `20260331000000_add_poll_tables` 레코드를 완료 상태로 업데이트하여 Prisma 차단 해제

## [26.04.03] - 2026-04-17

### Fixed
- 디시인사이드 모바일 URL 인식 불가 문제 수정
  - 모바일 URL을 데스크톱 URL로 변환 후 스크래핑하도록 변경
  - 모바일 페이지 HTML 구조가 달라 콘텐츠 추출 실패하던 문제 해결
  - `board` / `mgallery` / `mini` 타입 모두 대응
  - 임베드 링크는 사용자가 보낸 원본 모바일 URL 유지
- `/noti poll` 공지사항 채널 미설정 시 모달 전에 즉시 안내 메시지 반환
  - 기존: 모달 작성 후 제출해야 오류 확인 가능
  - 변경: 채널 미설정 시 모달 진입 전에 즉시 안내

### Technical
- `docker-compose.yml` 봇 시작 시 DB 마이그레이션 자동 적용
  - `docker compose pull && docker compose up -d`만으로 스키마 변경 자동 반영
  - `command: sh -c "npm run migrate:deploy && npm start"` 추가

## [26.04.02] - 2026-04-16

### Fixed
- 디시인사이드 임베드 이미지 표시 안정화
  - `dcimg*.dcinside.co.kr/viewimage.php` 이미지가 Referer 없이 `403`을 반환하는 케이스 대응
  - 게시글 본문 이미지와 원본 첨부파일 다운로드 링크를 모두 후보로 수집
  - 봇이 게시글 URL을 `Referer`로 포함해 이미지를 다운로드한 뒤 Discord 첨부파일(`attachment://`)로 임베드에 표시
  - `application/octet-stream`으로 내려오는 이미지도 PNG/JPG/GIF/WEBP 파일 시그니처로 판별
  - 캡차, 고정닉 아이콘, 로딩 이미지 등 게시글 본문이 아닌 시스템 이미지를 후보에서 제외
- `/noti poll` 투표 생성 안정화
  - 과거 실패한 생성 건의 `message_id = "pending"` unique 충돌로 새 투표 생성이 실패할 수 있던 문제 방지
  - 투표별 고유 pending placeholder를 사용하고, 메시지 전송/DB 업데이트 실패 시 고아 레코드와 메시지를 정리
- 커스텀 명령어와 내장 명령어 충돌 방지
  - `noti`, `welcome`, `help`, `version`, `role`을 예약어에 추가
  - 기존 DB에 충돌 커스텀 명령어가 있어도 slash command 등록이 중단되지 않도록 충돌 항목을 건너뜀

### Technical
- 패키지 버전을 `26.04.02`로 업데이트

## [26.04.01] - 2026-04-16

### Added
- 디시인사이드 임베드 모바일 URL 지원 확장
  - `https://m.dcinside.com/mgallery/{갤러리ID}/{게시글번호}` 형식 지원
  - `https://m.dcinside.com/mini/{갤러리ID}/{게시글번호}` 형식 지원
- 디시인사이드 임베드 이미지 미리보기
  - 게시글 본문에 포함된 첫 번째 이미지를 Discord Embed 이미지로 표시
  - 갤러리 대문/기본 썸네일로 오인될 수 있는 `og:image` fallback은 사용하지 않음
  - 로딩 이미지, no image, 디시 로고, 캡차 이미지는 제외

### Technical
- `.omx/` 로컬 런타임 상태 디렉터리를 Git 추적 대상에서 제외
- 디시인사이드 임베드 문서에 신규 모바일 URL 및 이미지 미리보기 동작 반영

## [1.2.1] - 2026-03-31

### Fixed
- GitHub Actions 워크플로우 GHA 캐시 제거
  - `src/` 변경 사항이 Docker 이미지에 반영되지 않던 문제 수정
  - `no-cache: true` 적용으로 매 릴리즈마다 새로 빌드

## [1.2.0] - 2026-03-31

### Added
- 공지사항 투표 기능 (`/noti poll`)
  - 투표 제목, 항목(최대 10개), 마감 시간(1~24시간), 중복 투표 허용 여부 설정
  - 버튼 클릭으로 투표, 재클릭 시 취소, 단일 투표 모드에서 다른 항목 클릭 시 자동 교체
  - 실시간 투표 수 및 비율 표시
  - 마감 시 버튼 비활성화 및 최종 결과 표시
  - 봇 재시작 시 미마감 투표 타이머 자동 복구

### Database
- `poll_messages` 테이블 추가 (투표 정보 저장)
- `poll_votes` 테이블 추가 (투표 기록 저장)

## [1.1.5] - 2026-03-14

### Removed
- 음악 재생 기능 일시 제거
  - `/play`, `/queue`, `/skip`, `/stop`, `/nowplaying` 명령어 제거
  - 음성 채널 연결 안정성 문제로 인한 일시적 제거
  - 향후 재구현 예정 (백업: `backup/music-debug-2026-03-14` 브랜치)

### Technical
- Alpine Linux 기반 Docker 이미지로 복원
- 음악 관련 패키지 제거 (play-dl, @discordjs/opus, sodium-native 등)
- 디버깅 로그 제거

## [1.0.11] - 2026-03-13

### Fixed
- 디시인사이드 모바일 URL 파싱 개선
  - 모바일 URL을 데스크톱 URL로 변환하지 않고 직접 파싱
  - 마이너 갤러리/미니 갤러리 모바일 URL 정상 처리
  - 갤러리 타입 자동 인식
  - 모든 갤러리 타입에서 미리보기 정상 작동

## [1.0.10] - 2026-03-13

### Fixed
- 디시인사이드 임베드 생성 오류 수정
  - Discord API의 빈 description 거부 문제 해결
  - summary가 있을 때만 description 설정
  - 게시글 미리보기 정상 작동
/- `/version` 명령어 개선
  - GitHub Releases 페이지로 이동하는 클릭 가능한 링크 추가
  - Description에 마크다운 링크 형식으로 제공

## [1.0.9] - 2026-03-13

### Fixed
- 디시인사이드 모바일 URL 쿼리 파라미터 지원
  - `?recommend=1`, `?page=1` 등 쿼리 파라미터 포함된 URL 정상 처리
  - 예: `https://m.dcinside.com/board/eft/2730298?recommend=1`
  - 모바일 URL 정규식 개선

## [1.0.8] - 2026-03-13

### Fixed
- `/welcome setup` 역할 5개 선택 시 오류 수정
  - Discord Modal customId 100자 제한 문제 해결
  - customId에 UUID 사용, role ID는 cache에 임시 저장
  - 모든 개수의 역할 선택 정상 작동
- `/version` 명령어 버전 정보 표시 오류 수정
  - Docker 이미지에 CHANGELOG.md 파일 포함
  - CHANGELOG.md 기반 버전 정보 정상 파싱

### Technical
- Dockerfile에 `COPY CHANGELOG.md ./` 추가
- welcome 모듈: `crypto.randomBytes`로 session ID 생성
- welcome setup/edit: cache 기반 role ID 관리

## [1.0.7] - 2026-03-13

### Added
- `/version` 명령어
  - 현재 봇 버전과 최종 업데이트 날짜 표시
  - CHANGELOG.md 기반 버전 정보 자동 파싱
  - 임베드 형식으로 깔끔한 UI

### Changed
- `/help` 명령어 권한 기반 표시 개선
  - 관리자: 기본 명령어 + 커스텀 명령어 모두 표시
  - 일반 유저: 커스텀 명령어만 표시
  - GitHub 이슈 링크는 공통 제공

## [1.0.6] - 2026-03-13

### Fixed
- `/welcome setup` 실행 시 "실행 중 오류가 발생했습니다" 문제 수정
  - Modal submit interaction timeout 문제 해결
  - 즉시 응답 예약(deferReply) 후 작업 처리
  - 5개 역할 선택 시에도 정상 동작
- `/help` 명령어 GitHub 링크 클릭 불가 문제 수정
  - Footer URL을 클릭 가능한 마크다운 링크로 변경
  - Description에 GitHub 이슈 링크 추가
- 커스텀 명령어 미리보기에 응답 내용 노출 문제 수정
  - description이 없을 때 response 내용 대신 "커스텀 명령어" 표시
  - Discord slash command 목록에서 깔끔한 표시
  - **참고**: 기존 커맨드 반영은 `/cmd reload` 실행 필요

## [1.0.5] - 2026-03-13

### Changed
- 웰컴 메시지 다중 역할 할당
  - `/welcome setup` - 최대 5개 역할 선택 가능
  - 버튼 1개 클릭으로 지정된 모든 역할 동시 부여
  - 이미 모든 역할을 보유한 경우 "이미 인증되었습니다" 표시

### Added
- `/welcome edit` 명령어
  - 기존 웰컴 메시지 수정
  - Modal에 현재 설정값 자동 입력
  - 역할 ID 쉼표로 구분하여 수정 가능

### Technical
- DB 스키마 업데이트
  - `welcome_message.role_id` → `role_ids` (String 배열)
  - **주의**: 기존 웰컴 메시지가 있는 경우, 배포 전에 데이터 백업 권장

## [1.0.4] - 2026-03-13

### Added
- 봇 상태 메시지 설정 기능
  - `/config bot_status <타입> <텍스트>` - 봇 상태 변경
  - 타입 선택: 플레이중, 시청중, 듣는중
  - DB에 저장되어 재시작 시에도 유지
  - 실시간으로 봇 프로필에 반영

- `/help` 명령어
  - 사용 가능한 모든 명령어 목록 조회
  - 기본 명령어 + 커스텀 명령어 포함
  - DM으로 전송
  - 봇 소개 및 이슈 제보 링크 포함

- 디시인사이드 모바일 URL 지원
  - `https://m.dcinside.com/board/{갤러리ID}/{게시글번호}` 형식 지원
  - 자동으로 데스크톱 URL로 변환하여 미리보기 생성

- 역할 패널 커스텀 이모지 자동 변환
  - Description에서 `:emoji_name:` 형식 자동 인식
  - 서버 커스텀 이모지로 자동 변환 (`<:emoji_name:emoji_id>`)
  - 애니메이션 이모지 지원 (`<a:emoji_name:emoji_id>`)
  - 수동으로 이모지 ID 입력할 필요 없음

### Fixed
- 웰컴 메시지 이모지 검증 로직 개선
  - 일반 텍스트 입력 시 Discord API 오류 발생 문제 수정
  - 유니코드 이모지 정규식 검증 추가
  - 유효하지 않은 입력은 무시하고 이모지 없이 버튼 생성

### Technical
- DB 스키마 업데이트
  - `guild_settings` 테이블에 `activity_type`, `activity_text` 필드 추가
  - `ActivityType` enum 추가 (PLAYING, WATCHING, LISTENING)

- 새로운 모듈 추가
  - `src/modules/help/` - 명령어 도움말

- 디시인사이드 미리보기 개선
  - 정규식 분리 (데스크톱/모바일)
  - URL 정규화 로직 강화

## [1.0.3] - 2026-03-13

### Added
- 웰컴 메시지 시스템 (`/welcome`)
  - `/config set welcome_channel` - 웰컴 채널 설정
  - `/welcome setup <역할>` - Modal로 웰컴 메시지 설정
    - 타이틀, 내용, 버튼 이모지(선택), 버튼 레이블 입력 지원
  - `/welcome remove` - 웰컴 메시지 삭제
  - 버튼 클릭 시 지정된 역할 자동 부여
  - 중복 클릭 방지 (이미 역할 보유 시 안내)
  - 길드당 1개의 웰컴 메시지 지원
  - 신규 멤버 규칙 동의 및 인증 시스템 구현

- 감사 로그 이미지 영구 보관
  - 메시지 삭제 시 이미지 자동 다운로드 및 재업로드
  - Discord CDN URL 만료 문제 해결
  - 삭제된 이미지를 로그 채널에 영구 보관
  - 여러 이미지 첨부 지원

- 음성 채널 이동 로그 (VOICE_MOVE)
  - 음성 채널 간 이동 시 별도 로그 기록
  - 이전 채널과 이후 채널 정보 표시
  - 기존 입장/퇴장 로그와 구분

### Changed
- 감사 로그 형식 대폭 개선 (DynoBot 스타일)
  - 임베드 Author에 유저 프로필 사진과 이름 표시
  - 간결한 설명으로 변경 (액션 중심)
  - Footer에 고유 ID 정보 표시
    - 음성/멤버 로그: `ID: <유저ID>`
    - 메시지 로그: `User ID: <유저ID> | Message ID: <메시지ID>`
  - 불필요한 필드 제거, 핵심 정보만 표시

- 메시지 수정 로그 개선
  - "Jump to Message" 링크 추가 (클릭 시 해당 메시지로 이동)
  - Before/After 필드로 변경 내용 명확히 표시
  - Author 정보로 누가 수정했는지 한눈에 파악

- 메시지 삭제 로그 개선
  - 메시지 내용을 Description에 직접 표시
  - Author 정보로 누가 삭제했는지 명확히 표시
  - 이미지는 임베드에 직접 첨부

- 음성 채널 로그 간소화
  - "joined voice channel #채널" 형식으로 변경
  - "left voice channel #채널" 형식으로 변경
  - "moved from #채널1 to #채널2" 형식으로 변경

- 멤버 입퇴장 로그 간소화
  - "joined the server" 형식으로 변경
  - "left the server" 형식으로 변경

- 역할 변경 로그 간소화
  - "was granted role @역할" 형식으로 변경
  - "was revoked role @역할" 형식으로 변경

### Technical
- DB 스키마 업데이트
  - `guild_settings` 테이블에 `welcome_channel_id` 필드 추가
  - `welcome_message` 테이블 신규 생성
    - id, guild_id (unique), channel_id, message_id, title, content, button_emoji, button_label, role_id
  - 1:1 관계로 길드당 1개의 웰컴 메시지 보장

- 새로운 모듈 추가
  - `src/modules/welcome/` - 웰컴 메시지 관리
  - Modal 기반 설정 인터페이스
  - 버튼 인터랙션 처리

- 감사 로그 리팩토링
  - `SendLogOptions` 인터페이스 확장 (author, title, url, footer 옵션 추가)
  - 모든 이벤트 핸들러에 일관된 형식 적용
  - 이미지 다운로드 로직 추가 (fetch API + AttachmentBuilder)

- CLAUDE.md 문서 업데이트
  - 웰컴 메시지 기능 설명 추가
  - 감사 로그 개선 사항 반영
  - 배포 및 운영 섹션 추가 (Docker 구성, 마이그레이션 가이드)

## [1.0.2] - 2026-03-12

### Added
- 커스텀 명령어 미리보기 설명 기능
  - `description` 필드 추가 (최대 100자)
  - Discord 슬래시 명령어 목록에서 명령어별 설명 표시
  - 설명이 없으면 응답 내용의 처음 100자를 자동으로 사용

- 커스텀 명령어 수정 기능
  - `/cmd edit` 명령어 추가
  - 기존 명령어의 응답 내용 및 미리보기 설명 수정 가능
  - Modal을 통한 편리한 수정 인터페이스

- Modal 기반 입력 시스템
  - `/cmd add`, `/cmd edit`를 Modal 기반으로 전환
  - 자연스러운 줄바꿈 입력 가능 (Enter 키 사용)
  - 코드블럭(\`\`\`) 및 마크다운 형식 그대로 입력 가능
  - 긴 URL 목록 입력 지원 (최대 4000자)

### Changed
- 커스텀 명령어 응답 길이 제한 확대
  - 2000자 → 4000자로 변경
  - 여러 이미지 URL 저장 가능

- 입력 처리 방식 개선
  - `\n` 이스케이프 처리 제거
  - Modal에서 입력한 줄바꿈을 실제 줄바꿈으로 자동 처리
  - 사용자가 직관적으로 입력 가능

### Technical
- DB 스키마 업데이트
  - `custom_commands` 테이블에 `description` 필드 추가 (VARCHAR(100), nullable)

- 모듈 구조 개선
  - `src/modules/customCommands/modals.ts` 추가
  - Modal 생성 및 처리 로직 분리
  - 자동완성 및 Modal submit interaction 통합 처리

## [1.0.1] - 2026-03-12

### Added
- 커스텀 명령어 고급 기능
  - 줄바꿈 지원 (`\n`을 실제 줄바꿈으로 변환)
  - 랜덤 응답 기능 (`|||` 구분자로 여러 응답 중 랜덤 선택)
  - 임베드 형식 지원 (`EMBED:제목|||내용` 형식)
  - 랜덤 + 임베드 조합 가능

### Changed
- 감사 로그 설정 통합
  - `/config set log_channel`로 로그 채널 설정 시 자동으로 감사 로그 활성화
  - 별도의 활성화 명령어 불필요
  - `/config show`에 감사 로그 상태 표시 추가

- 프로필 이미지 개선
  - DC임베드와 이모지 확대 기능에서 서버별 니트로 프로필 우선 사용
  - `member.displayAvatarURL()` 사용으로 서버별 커스텀 프로필 지원

- Docker Compose 호환성 개선
  - `version` 필드 제거 (Docker Compose v2 표준 준수)
  - 경고 메시지 제거

### Removed
- `/audit` 명령어 제거 (중복 기능)
  - `/audit on/off/channel/status` 명령어 모두 제거
  - `/config set log_channel`로 통합

### Fixed
- 감사 로그가 활성화되지 않던 문제 수정
  - `audit_enabled` 플래그 의존성 제거
  - `log_channel_id` 설정 여부만으로 감사 로그 자동 활성화

## [1.0.0] - 2026-03-12

### Added
- 관리자 설정 기능 (`/config`)
  - 역할 패널 채널, 관리자 채널, 로그 채널, 공지사항 채널 설정
  - `/config set`, `/config show` 명령어

- 역할 선택 패널 기능 (`/panel`)
  - MULTI/SINGLE 모드 지원
  - 버튼 기반 역할 토글
  - `/panel create/add/remove/list/publish/set_message` 명령어

- 커스텀 명령어 관리 (`/cmd`)
  - 관리자가 슬래시 명령어를 동적으로 생성/삭제
  - `/cmd add/remove/list/reload` 명령어
  - 예약어 검증 (panel, config, cmd, role, noti)
  - DB 저장 후 Discord API 동적 등록

- 공지사항 관리 시스템 (`/noti`)
  - Modal을 통한 공지사항 작성/발송
  - `/noti send/edit/remove` 명령어
  - 역할/채널 멘션 자동 파싱 (@역할이름 → Discord 멘션 형식)
  - 감사 로그 자동 기록

- 역할 통계 기능 (`/role`)
  - 특정 역할 보유 사용자 목록 조회 (`/role stats`)
  - 전체 역할 통계 조회 (`/role list`)

- 감사 로그 시스템
  - 음성 채널 출입/퇴장 기록
  - 메시지 수정/삭제 기록
  - 멤버 입장/퇴장 기록
  - 역할 변경 기록
  - 설정 변경 기록
  - DB + 로그 채널 동시 기록

- 자동 기능
  - 커스텀 이모지 확대 기능
  - 디시인사이드 게시글 미리보기 (Embed 형식)
