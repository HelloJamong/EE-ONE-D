# 배포 가이드

EE-ONE-D 봇을 Docker를 통해 배포하는 방법을 안내합니다.

## 목차

1. [배포 준비](#배포-준비)
2. [Docker Hub를 통한 배포](#docker-hub를-통한-배포)
3. [로컬 개발 환경](#로컬-개발-환경)
4. [CI/CD 자동 배포](#cicd-자동-배포)
5. [문제 해결](#문제-해결)

---

## 배포 준비

### 필수 요구사항

- Docker 및 Docker Compose 설치
- Discord 봇 토큰 및 클라이언트 ID
- 서버 관리자 권한

### Discord 봇 설정

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 애플리케이션 생성
2. Bot 섹션에서 토큰 발급
3. Privileged Gateway Intents 활성화:
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`
4. OAuth2 → URL Generator에서 봇 초대 링크 생성
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions:
     - `Manage Roles`
     - `Read Messages/View Channels`
     - `Send Messages`
     - `Manage Messages`
     - `Embed Links`

---

## Docker Hub를 통한 배포

### 1. 릴리즈에서 파일 다운로드

GitHub 릴리즈 페이지에서 최신 릴리즈의 첨부 파일을 다운로드합니다:
- `.env.example`
- `docker-compose.yml`

### 2. 환경 변수 설정

```bash
# .env.example을 .env로 복사
cp .env.example .env

# .env 파일 편집
nano .env
```

**필수 환경 변수:**

```env
# Discord 설정
DISCORD_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-client-id-here
COMMAND_SCOPE=guild
DISCORD_GUILD_ID=your-guild-id-here

# 데이터베이스 (기본값 사용 권장)
DATABASE_URL=postgresql://postgres:postgres@db:5432/eeoned?schema=public

# 런타임
NODE_ENV=production
LOG_LEVEL=info
```

### 3. 배포 실행

```bash
# Docker Compose로 배포 (Docker Hub에서 이미지 pull)
docker compose up -d

# 로그 확인
docker compose logs -f bot

# 상태 확인
docker compose ps
```

### 4. 배포 확인

봇이 정상적으로 시작되면 다음과 같은 로그가 표시됩니다:

```
Starting EE-ONE-D bot
Bot is ready
```

Discord 서버에서 `/config show` 명령어로 봇이 정상 작동하는지 확인합니다.

---

## 로컬 개발 환경

### 1. 저장소 클론

```bash
git clone https://github.com/yourusername/EE-ONE-D.git
cd EE-ONE-D
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일 편집
```

### 3. 로컬에서 빌드 및 실행

```bash
# Docker Compose로 로컬 빌드 및 실행
docker compose up --build -d

# 로그 확인
docker compose logs -f bot
```

### 4. 개발 모드 (Hot Reload)

```bash
# 호스트에서 직접 실행 (개발용)
npm install
npm run dev
```

**참고:** 개발 모드로 실행 시 PostgreSQL은 여전히 Docker로 실행해야 합니다:

```bash
# DB만 실행
docker compose up db -d

# 호스트에서 봇 실행
npm run dev
```

---

## CI/CD 자동 배포

### GitHub Actions 워크플로우

프로젝트에는 자동 배포를 위한 GitHub Actions 워크플로우가 포함되어 있습니다.

### 배포 프로세스

1. **태그 생성 및 푸시**

   ```bash
   # 버전 태그 생성 (예: v1.0.0)
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **자동 실행 단계**
   - Docker 이미지 빌드 (linux/amd64, linux/arm64)
   - Docker Hub에 푸시 (`igor0670/ee-one-d:v1.0.0`, `igor0670/ee-one-d:latest`)
   - GitHub 릴리즈 생성
   - `.env.example`과 `docker-compose.yml` 첨부

### Docker Hub 시크릿 설정

GitHub 저장소 Settings → Secrets and variables → Actions에서 다음 시크릿을 추가:

- `DOCKER_USERNAME`: Docker Hub 사용자명
- `DOCKER_PASSWORD`: Docker Hub 액세스 토큰

### CHANGELOG.md 업데이트

릴리즈 전 `CHANGELOG.md`를 업데이트하면 릴리즈 노트에 자동으로 포함됩니다.

**형식:**

```markdown
## [1.0.1] - 2026-03-15

### Added
- 새로운 기능 추가

### Fixed
- 버그 수정

### Changed
- 기존 기능 변경
```

---

## 문제 해결

### 봇이 시작되지 않아요

**로그 확인:**

```bash
docker compose logs bot
```

**일반적인 원인:**
- 잘못된 Discord 토큰 → `.env` 파일 확인
- 데이터베이스 연결 실패 → `docker compose ps`로 DB 상태 확인
- 권한 부족 → Discord Developer Portal에서 Intents 확인

### 데이터베이스 초기화

```bash
# 컨테이너 중지 및 제거
docker compose down

# 볼륨 삭제 (데이터 초기화)
docker volume rm eeoned_db-data

# 재시작
docker compose up -d
```

### 이미지 업데이트

```bash
# 최신 이미지 pull
docker compose pull

# 재시작
docker compose up -d
```

### 로그 레벨 변경

`.env` 파일에서 `LOG_LEVEL` 수정:

```env
LOG_LEVEL=debug  # trace, debug, info, warn, error
```

### 포트 충돌

봇은 별도의 포트를 사용하지 않지만, PostgreSQL이 호스트의 5432 포트와 충돌할 수 있습니다.

**해결 방법:**

`docker-compose.yml`에서 DB 포트 매핑 변경:

```yaml
services:
  db:
    ports:
      - "5433:5432"  # 호스트:컨테이너
```

---

## 업데이트 및 유지보수

### 버전 업그레이드

1. GitHub 릴리즈에서 최신 버전 확인
2. 새 버전의 `docker-compose.yml` 및 `.env.example` 다운로드
3. 기존 `.env` 파일과 비교하여 새로운 환경 변수 추가
4. 컨테이너 재시작:

   ```bash
   docker compose pull
   docker compose up -d
   ```

### 백업

**데이터베이스 백업:**

```bash
# 백업 생성
docker compose exec db pg_dump -U postgres eeoned > backup.sql

# 복원
docker compose exec -T db psql -U postgres eeoned < backup.sql
```

**환경 변수 백업:**

```bash
cp .env .env.backup
```

---

## 프로덕션 모드 vs 개발 모드

| 항목 | 프로덕션 | 개발 |
|------|---------|------|
| **실행 명령어** | `docker compose up -d` | `docker compose up --build -d` 또는 `npm run dev` |
| **이미지 소스** | Docker Hub (pull) | 로컬 빌드 |
| **로그 레벨** | `info` | `debug` |
| **재시작 정책** | `unless-stopped` | `unless-stopped` |
| **Hot Reload** | ❌ | ✅ (npm run dev) |

---

## 참고 자료

- [Docker Compose 문서](https://docs.docker.com/compose/)
- [Discord.js 가이드](https://discordjs.guide/)
- [프로젝트 명령어 가이드](./docs/COMMANDS.md)
- [기술 문서](./.claude/CLAUDE.md)

---

**버전:** 1.0
**최종 수정일:** 2026-03-12
