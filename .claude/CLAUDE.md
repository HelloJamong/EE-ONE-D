# EE-ONE-D

단일 Discord 서버용 통합 관리 봇. Rocky Linux 9 Docker 환경에서 운영.

## 기술 스택

| 카테고리 | 기술 |
|---------|-----|
| Runtime | Node.js 20+, TypeScript 5.4 |
| Discord | discord.js v14 |
| Database | PostgreSQL 15 (Alpine) + Prisma ORM |
| Infra | Docker / docker-compose |
| Logging | pino |
| Validation | zod |
| Scraping | cheerio (디시인사이드 미리보기용) |

## 주요 기능

### 1. 역할 선택 패널 (`src/modules/rolePanels/`)
- MULTI/SINGLE 모드 지원
- 버튼 기반 역할 토글
- `/panel create/add/remove/list/publish/set_message` 명령어
- 버튼 customId 규칙: `rp:<panelId>:<itemId>`
- 커스텀 이모지 자동 변환: Description에서 `:emoji_name:` → `<:emoji_name:emoji_id>`

### 2. 관리자 설정 (`src/modules/config/`)
- `/config set/show` 명령어
- admin 채널, panel 채널, log 채널, notification 채널, welcome 채널 설정
- `/config bot_status <타입> <텍스트>` - 봇 상태 메시지 설정
  - 타입: 플레이중(PLAYING), 시청중(WATCHING), 듣는중(LISTENING)
  - DB에 저장되어 재시작 시에도 유지
- `Administrator` 권한 필요

### 3. 감사 로그 (`src/modules/audit/`)
- DB + 로그 채널 동시 기록
- 이벤트: 음성 입/퇴장/이동, 메시지 삭제/수정, 멤버 입/퇴장, 역할 변경, 설정 변경
- 메시지 삭제 시 이미지 자동 다운로드 및 재업로드 (영구 보관)
- 로그 footer에 Author ID와 Message ID 표시 (DynoBot 형식)
- 음성 채널 이동 로그 (이전 채널 → 이후 채널)

### 4. 커스텀 이모지 확대 (`src/modules/emojiExpand/`)
- 커스텀 이모지 단독 메시지 자동 확대

### 5. 디시인사이드 미리보기 (`src/modules/dcEmbed/`)
- DC 링크 단독 메시지 -> 임베드 미리보기
- 데스크톱/모바일 URL 모두 지원
  - 데스크톱: `https://gall.dcinside.com/board/view/?id=...&no=...`
  - 모바일: `https://m.dcinside.com/board/{갤러리ID}/{게시글번호}`
- TTL 캐싱 적용

### 6. 커스텀 명령어 (`src/modules/customCommands/`)
- `/cmd add/remove/list/reload` 명령어
- 관리자가 커스텀 슬래시 커맨드 등록/삭제
- DB 저장 후 Discord API 동적 등록 (재시작 불필요)
- 예약어 검증 (panel, config, cmd)
- 감사 로그 자동 기록

### 7. 역할 통계 (`src/modules/roleStats/`)
- `/role stats <역할>` - 특정 역할 보유 사용자 목록 조회
- `/role list` - 전체 역할과 사용자 수 통계

### 8. 공지사항 관리 (`src/modules/notifications/`)
- `/config set notification_channel` - 공지사항 채널 설정
- `/noti send` - Modal로 공지 작성 및 발송
- `/noti edit <메시지ID>` - 공지 수정
- `/noti remove <메시지ID>` - 공지 삭제
- 관리자 전용, admin_config_channel에서만 사용 가능
- 감사 로그 자동 기록

### 9. 웰컴 메시지 (`src/modules/welcome/`)
- `/config set welcome_channel` - 웰컴 채널 설정
- `/welcome setup <역할1~5>` - Modal로 웰컴 메시지 설정 (타이틀, 내용, 버튼 이모지, 버튼 레이블)
  - 최대 5개 역할 선택 가능 (role1 필수, role2-5 선택)
  - 버튼 1개 클릭으로 지정된 모든 역할 동시 부여
- `/welcome edit` - 기존 웰컴 메시지 수정 (Modal에 현재 값 자동 입력)
- `/welcome remove` - 웰컴 메시지 삭제
- 버튼 클릭 시 지정된 모든 역할 자동 부여
- 중복 클릭 방지 (모든 역할 보유 시 "이미 인증되었습니다" 메시지)
- 길드당 1개의 웰컴 메시지만 지원
- 버튼 customId 규칙: `welcome:<guildId>`
- 관리자 전용, admin_config_channel에서만 사용 가능

### 10. 도움말 (`src/modules/help/`)
- `/help` - 사용 가능한 모든 명령어 목록 조회
- 기본 명령어 + 커스텀 명령어 모두 포함
- DM으로 전송
- 봇 소개 및 GitHub 이슈 링크 포함

## 프로젝트 구조

```
src/
├── index.ts              # 엔트리포인트
├── types.ts              # 공통 타입 정의
├── modules/              # 기능별 모듈
│   ├── audit/            # 감사 로그
│   ├── config/           # 관리자 설정
│   ├── customCommands/   # 커스텀 명령어
│   ├── dcEmbed/          # 디시인사이드 미리보기
│   ├── emojiExpand/      # 이모지 확대
│   ├── help/             # 도움말
│   ├── notifications/    # 공지사항 관리
│   ├── rolePanels/       # 역할 패널
│   ├── roleStats/        # 역할 통계
│   └── welcome/          # 웰컴 메시지
└── shared/               # 공유 유틸리티
    ├── cache.ts          # 캐시 유틸
    ├── db.ts             # Prisma 클라이언트
    ├── discord.ts        # Discord 클라이언트
    ├── env.ts            # 환경변수 파싱
    └── logger.ts         # pino 로거
```

## 데이터베이스 스키마

- `guild_settings`: 길드별 설정
  - 채널: role_panel, admin_config, log, notification, welcome
  - 봇 상태: activity_type (PLAYING/WATCHING/LISTENING), activity_text
- `role_panels`: 역할 패널 정보 (MULTI/SINGLE 모드)
- `role_panel_items`: 패널 내 역할 항목
- `audit_events`: 감사 로그 이벤트
- `custom_commands`: 커스텀 명령어 정보 (이름, 설명, 응답)
- `welcome_message`: 웰컴 메시지 정보 (타이틀, 내용, 버튼, 다중 역할)

## 개발 명령어

```bash
# 개발 모드 (hot reload)
npm run dev

# 빌드
npm run build

# 프로덕션 실행
npm start

# Prisma
npm run prisma:generate    # 클라이언트 생성
npm run migrate:dev        # 개발 마이그레이션
npm run migrate:deploy     # 배포 마이그레이션

# Docker
docker compose up --build -d
```

## 배포 및 운영

### Docker 컨테이너 구성

프로젝트는 Docker Compose로 관리되며, 두 개의 서비스로 구성됩니다:

#### DB 서비스
- 이미지: `postgres:15-alpine`
- 컨테이너 이름: `eeoned-db`
- 볼륨: `db-data` (영속성 보장)
- 기본 데이터베이스: `eeoned`
- Health Check: `pg_isready` 기반 헬스체크 (10초 간격)
- 재시작 정책: `unless-stopped`

#### Bot 서비스
- 이미지: `igor0670/ee-one-d:latest`
- 컨테이너 이름: `eeoned-bot`
- DB 서비스 health check 완료 후 시작
- `.env` 파일에서 환경변수 로드
- 재시작 정책: `unless-stopped`

### 데이터베이스 마이그레이션

**중요**: DB 스키마 변경 시 반드시 마이그레이션을 수행해야 합니다.

```bash
# 배포 환경에서 마이그레이션 적용
npm run migrate:deploy

# 또는 Docker 컨테이너 내에서
docker compose exec bot npm run migrate:deploy
```

**주의사항**:
- 이전 버전에서 새 버전으로 업데이트 시, DB 마이그레이션을 먼저 수행
- 볼륨(`db-data`)에 데이터가 영속적으로 저장되므로 컨테이너 재생성 시에도 데이터 유지
- 스키마 변경이 포함된 PR은 마이그레이션 파일도 함께 포함해야 함

## 환경 변수

| 변수 | 설명 |
|-----|------|
| `DISCORD_TOKEN` | 봇 토큰 |
| `DISCORD_CLIENT_ID` | 클라이언트 ID |
| `COMMAND_SCOPE` | `guild` 또는 `global` |
| `DISCORD_GUILD_ID` | 대상 길드 ID (guild scope 시 필수) |
| `DATABASE_URL` | PostgreSQL 연결 URL |
| `NODE_ENV` | `development` / `production` |
| `LOG_LEVEL` | 로그 레벨 (info, debug 등) |

## Discord 봇 권한

- Privileged Intents: `SERVER MEMBERS INTENT`, `MESSAGE CONTENT INTENT`
- Bot Permissions: `Manage Roles`, `Read Messages/View Channels`, `Send Messages`, `Manage Messages`, `Embed Links`

## 코드 컨벤션

- ESM 모듈 시스템 사용 (`"type": "module"`)
- 모듈별 `index.ts`에서 기능 export
- Prisma 타입 세이프 쿼리 활용
- zod로 환경변수/입력 검증
