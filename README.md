# EE-ONE-D

Discord 서버용 통합 관리 봇 - 역할 선택, 커스텀 명령어, 공지사항 관리, 감사 로그 등을 제공합니다.

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-igor0670%2Fee--one--d-blue)](https://hub.docker.com/r/igor0670/ee-one-d)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 주요 기능

- **역할 선택 패널**: 버튼 기반 역할 토글 (MULTI/SINGLE 모드)
- **공지사항 관리**: Modal을 통한 공지 작성/수정/삭제
- **커스텀 명령어**: 관리자가 동적으로 슬래시 명령어 등록
- **감사 로그**: 음성/메시지/멤버/역할 변경 자동 기록
- **역할 통계**: 역할별 사용자 목록 조회
- **자동 기능**: 커스텀 이모지 확대, 디시인사이드 미리보기

---

## 빠른 시작 (Docker)

### 1. 필수 요구사항

- Docker 및 Docker Compose 설치
- Discord 봇 토큰 발급 ([Discord Developer Portal](https://discord.com/developers/applications))

### 2. 배포 파일 다운로드

GitHub 릴리즈에서 최신 버전의 배포 파일을 다운로드합니다:

```bash
# 최신 릴리즈 버전 확인: https://github.com/HelloJamong/EE-ONE-D/releases

# docker-compose.yml 다운로드
curl -LO https://github.com/HelloJamong/EE-ONE-D/releases/latest/download/docker-compose.yml

# .env.example 다운로드
curl -LO https://github.com/HelloJamong/EE-ONE-D/releases/latest/download/.env.example
```

**특정 버전 다운로드:**
```bash
VERSION=v1.0.0
curl -LO https://github.com/HelloJamong/EE-ONE-D/releases/download/${VERSION}/docker-compose.yml
curl -LO https://github.com/HelloJamong/EE-ONE-D/releases/download/${VERSION}/.env.example
```

### 3. 환경 변수 설정

`.env.example`을 `.env`로 복사하고 설정값을 입력합니다:

```bash
cp .env.example .env
nano .env  # 또는 vi, vim 등
```

**필수 환경 변수:**

```env
# Discord 봇 토큰 (필수)
DISCORD_TOKEN=your-bot-token-here

# Discord 클라이언트 ID (필수)
DISCORD_CLIENT_ID=your-client-id-here

# 명령어 범위 설정
COMMAND_SCOPE=guild              # guild: 단일 서버, global: 모든 서버
DISCORD_GUILD_ID=your-guild-id   # guild 모드 시 필수

# 데이터베이스 (기본값 사용 권장)
DATABASE_URL=postgresql://postgres:postgres@db:5432/eeoned?schema=public

# 런타임
NODE_ENV=production
LOG_LEVEL=info
```

**Discord 봇 토큰 발급 방법:**
1. [Discord Developer Portal](https://discord.com/developers/applications)에서 애플리케이션 생성
2. Bot 섹션에서 토큰 복사
3. Privileged Gateway Intents 활성화: `SERVER MEMBERS INTENT`, `MESSAGE CONTENT INTENT`

**Discord 서버 ID (Guild ID) 확인:**
1. Discord 설정 → 앱 설정 → 고급 → 개발자 모드 활성화
2. 서버 우클릭 → "서버 ID 복사"

### 4. 봇 실행

```bash
# Docker Compose로 봇 시작 (이미지는 Docker Hub에서 자동 다운로드)
docker compose up -d

# 로그 확인
docker compose logs -f bot

# 상태 확인
docker compose ps
```

봇이 정상적으로 시작되면 다음과 같은 로그가 표시됩니다:
```
Starting EE-ONE-D bot
Bot is ready
```

### 5. 봇 초대

봇을 Discord 서버에 초대하려면 다음 URL을 생성하여 브라우저에서 엽니다:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268445760&scope=bot%20applications.commands
```

**YOUR_CLIENT_ID**를 실제 클라이언트 ID로 변경하세요.

**필수 권한:**
- Manage Roles (역할 관리)
- Read Messages/View Channels (메시지 읽기/채널 보기)
- Send Messages (메시지 전송)
- Manage Messages (메시지 관리)
- Embed Links (링크 임베드)

---

## 사용 방법

### 초기 설정

1. 봇을 Discord 서버에 초대한 후, 관리자 권한을 가진 사용자로 다음 명령어를 실행합니다:

```
/config set admin_config_channel:#관리자채널
/config set role_panel_channel:#역할선택채널
/config set log_channel:#로그채널
/config set notification_channel:#공지사항채널
```

2. 설정 확인:

```
/config show
```

### 역할 패널 생성

```
/panel create <패널이름> <모드>
/panel add <패널이름> <역할> <버튼레이블> <이모지>
/panel publish <패널이름>
```

### 공지사항 발송

```
/noti send
```

Modal이 표시되면 제목과 내용을 입력합니다. `@역할이름`, `#채널이름` 형식으로 멘션 가능.

### 커스텀 명령어 추가

```
/cmd add <명령어이름> <응답내용>
```

자세한 사용법은 [명령어 가이드](docs/COMMANDS.md)를 참고하세요.

---

## 업데이트

새 버전이 릴리즈되면 다음 명령으로 업데이트할 수 있습니다:

```bash
# 최신 이미지 다운로드
docker compose pull

# 컨테이너 재시작
docker compose up -d
```

---

## 문제 해결

### 봇이 시작되지 않아요

```bash
# 로그 확인
docker compose logs bot

# 일반적인 원인:
# - 잘못된 Discord 토큰 → .env 파일 확인
# - 데이터베이스 연결 실패 → docker compose ps로 DB 상태 확인
```

### 데이터베이스 초기화

```bash
# 컨테이너 중지 및 제거
docker compose down

# 볼륨 삭제 (데이터 초기화)
docker volume rm eeoned_db-data

# 재시작
docker compose up -d
```

### 이미지 수동 다운로드

```bash
# 특정 버전 다운로드
docker pull igor0670/ee-one-d:v1.0.0

# 최신 버전 다운로드
docker pull igor0670/ee-one-d:latest
```

더 많은 문제 해결 방법은 [배포 가이드](DEPLOYMENT.md)를 참고하세요.

---

## 로컬 개발

개발 환경에서 봇을 실행하려면:

```bash
# 저장소 클론
git clone https://github.com/HelloJamong/EE-ONE-D.git
cd EE-ONE-D

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 로컬 빌드 및 실행
docker compose up --build -d

# 또는 호스트에서 직접 실행 (개발 모드)
npm install
npm run dev
```

자세한 개발 가이드는 [DEPLOYMENT.md](DEPLOYMENT.md)를 참고하세요.

---

## 기술 스택

| 카테고리 | 기술 |
|---------|-----|
| Runtime | Node.js 20+, TypeScript 5.4 |
| Discord | discord.js v14 |
| Database | PostgreSQL 15 + Prisma ORM |
| Infra | Docker / docker-compose |
| Logging | pino |

---

## 문서

- [명령어 가이드](docs/COMMANDS.md) - 모든 명령어 사용법
- [배포 가이드](DEPLOYMENT.md) - 상세 배포 및 운영 가이드
- [기술 문서](.claude/CLAUDE.md) - 프로젝트 구조 및 개발 가이드

---

## 라이선스

MIT License

---

## 지원

- 이슈 리포트: [GitHub Issues](https://github.com/HelloJamong/EE-ONE-D/issues)
- 최신 릴리즈: [GitHub Releases](https://github.com/HelloJamong/EE-ONE-D/releases)
- Docker Hub: [igor0670/ee-one-d](https://hub.docker.com/r/igor0670/ee-one-d)
