# Changelog

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

