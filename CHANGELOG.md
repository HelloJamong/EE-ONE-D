# Changelog

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

