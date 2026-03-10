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

### 2. 관리자 설정 (`src/modules/config/`)
- `/config set/show` 명령어
- admin 채널, panel 채널, log 채널 설정
- `Administrator` 권한 필요

### 3. 감사 로그 (`src/modules/audit/`)
- DB + 로그 채널 동시 기록
- 이벤트: 음성 입/퇴장, 메시지 삭제/수정, 멤버 입/퇴장, 역할 변경, 설정 변경

### 4. 커스텀 이모지 확대 (`src/modules/emojiExpand/`)
- 커스텀 이모지 단독 메시지 자동 확대

### 5. 디시인사이드 미리보기 (`src/modules/dcEmbed/`)
- DC 링크 단독 메시지 -> 임베드 미리보기
- TTL 캐싱 적용

## 프로젝트 구조

```
src/
├── index.ts              # 엔트리포인트
├── types.ts              # 공통 타입 정의
├── modules/              # 기능별 모듈
│   ├── audit/            # 감사 로그
│   ├── config/           # 관리자 설정
│   ├── dcEmbed/          # 디시인사이드 미리보기
│   ├── emojiExpand/      # 이모지 확대
│   └── rolePanels/       # 역할 패널
└── shared/               # 공유 유틸리티
    ├── cache.ts          # 캐시 유틸
    ├── db.ts             # Prisma 클라이언트
    ├── discord.ts        # Discord 클라이언트
    ├── env.ts            # 환경변수 파싱
    └── logger.ts         # pino 로거
```

## 데이터베이스 스키마

- `guild_settings`: 길드별 채널 설정
- `role_panels`: 역할 패널 정보 (MULTI/SINGLE 모드)
- `role_panel_items`: 패널 내 역할 항목
- `audit_events`: 감사 로그 이벤트

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
