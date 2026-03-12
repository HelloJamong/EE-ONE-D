# Changelog

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

