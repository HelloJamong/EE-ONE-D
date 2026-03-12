# 문제 해결 및 FAQ

EE-ONE-D 사용 중 발생할 수 있는 문제와 해결 방법을 정리한 문서입니다.

---

## 목차

- [자주 묻는 질문 (FAQ)](#자주-묻는-질문-faq)
- [배포 및 실행 문제](#배포-및-실행-문제)
- [Discord 관련 문제](#discord-관련-문제)
- [기능별 문제](#기능별-문제)
- [데이터베이스 문제](#데이터베이스-문제)

---

## 자주 묻는 질문 (FAQ)

### Q1. 봇을 여러 서버에서 사용할 수 있나요?

**A:** 현재 EE-ONE-D는 **단일 서버 전용 봇**으로 설계되었습니다. `.env` 파일에서 `COMMAND_SCOPE=guild`로 설정하고 `DISCORD_GUILD_ID`에 특정 서버 ID를 지정해야 합니다.

여러 서버에서 사용하려면:
- `COMMAND_SCOPE=global`로 변경 (권장하지 않음, 성능 및 설정 충돌 가능)
- 서버마다 별도의 봇 인스턴스 배포

### Q2. 봇 토큰은 어디서 확인하나요?

**A:** [Discord Developer Portal](https://discord.com/developers/applications)에서 확인할 수 있습니다.

자세한 방법은 [Discord 봇 설정 가이드](discord-setup.md)를 참고하세요.

### Q3. 슬래시 명령어가 보이지 않아요

**A:** 다음 사항을 확인하세요:

1. **봇 권한 확인**: `applications.commands` 스코프로 초대했는지 확인
2. **Discord 캐시**: Discord 클라이언트 재시작 또는 Ctrl+R로 새로고침
3. **명령어 범위 확인**:
   - `COMMAND_SCOPE=guild`: 특정 서버에만 명령어 등록
   - `DISCORD_GUILD_ID`가 올바른지 확인
4. **봇 로그 확인**:
   ```bash
   docker compose logs bot | grep "commands registered"
   ```

### Q4. 커스텀 명령어를 추가했는데 바로 안 보여요

**A:** 커스텀 명령어는 추가 후 Discord API에 등록되는 데 시간이 걸릴 수 있습니다.

- **Guild 스코프**: 보통 즉시 반영 (최대 1-2분)
- **Global 스코프**: 최대 1시간 소요

Discord 클라이언트를 재시작하거나 `/cmd reload` 명령어를 실행해보세요.

### Q5. 역할 패널 버튼을 눌렀는데 역할이 안 부여돼요

**A:** 다음을 확인하세요:

1. **봇 역할 위치**: Discord 서버 설정 → 역할에서 봇의 역할이 부여할 역할보다 **위에 있어야** 합니다.
2. **봇 권한**: `Manage Roles` 권한이 있는지 확인
3. **로그 확인**:
   ```bash
   docker compose logs bot | grep -i "role"
   ```

### Q6. 감사 로그가 작동하지 않아요

**A:** v1.0.1부터 감사 로그는 로그 채널 설정 시 자동으로 활성화됩니다.

```bash
/config set log_channel:#로그채널
/config show  # 감사 로그 상태 확인
```

**상태가 "비활성화"인 경우:**
- 로그 채널이 올바르게 설정되었는지 확인
- 봇이 해당 채널에 메시지를 보낼 수 있는 권한이 있는지 확인

### Q7. 공지사항 수정/삭제 시 메시지 ID는 어떻게 확인하나요?

**A:** Discord 개발자 모드를 활성화한 후 메시지를 우클릭하면 "메시지 ID 복사" 옵션이 나타납니다.

**개발자 모드 활성화:**
1. Discord 설정 → 앱 설정 → 고급
2. "개발자 모드" 토글 활성화

### Q8. 데이터가 날아갔어요! 복구할 수 있나요?

**A:** 데이터는 Docker 볼륨에 저장되며, 컨테이너를 삭제해도 볼륨은 유지됩니다.

**데이터 확인:**
```bash
docker volume ls | grep eeoned
```

**백업 생성 (권장):**
```bash
# PostgreSQL 덤프 생성
docker compose exec db pg_dump -U postgres eeoned > backup.sql

# 복원
docker compose exec -T db psql -U postgres eeoned < backup.sql
```

---

## 배포 및 실행 문제

### 봇이 시작되지 않아요

**증상:** 컨테이너가 계속 재시작되거나 즉시 종료됨

**해결 방법:**

1. **로그 확인**
   ```bash
   docker compose logs bot
   ```

2. **일반적인 원인**

   | 오류 메시지 | 원인 | 해결 방법 |
   |-----------|------|---------|
   | `Invalid token` | 잘못된 Discord 토큰 | `.env` 파일의 `DISCORD_TOKEN` 확인 |
   | `Incorrect guild ID` | 잘못된 서버 ID | `.env` 파일의 `DISCORD_GUILD_ID` 확인 |
   | `Can't reach database` | DB 연결 실패 | `docker compose ps`로 DB 컨테이너 상태 확인 |
   | `Disallowed intents` | 인텐트 미활성화 | [Discord 봇 설정](discord-setup.md)에서 인텐트 활성화 |

3. **환경 변수 검증**
   ```bash
   # .env 파일 문법 확인
   cat .env | grep -v '^#' | grep '='

   # 필수 변수 확인
   docker compose config | grep -E 'DISCORD_TOKEN|DISCORD_CLIENT_ID|DISCORD_GUILD_ID'
   ```

### Docker 이미지를 다운로드할 수 없어요

**증상:** `manifest unknown` 또는 `not found` 오류

**해결 방법:**

1. **이미지 수동 다운로드**
   ```bash
   # 최신 버전
   docker pull igor0670/ee-one-d:latest

   # 특정 버전
   docker pull igor0670/ee-one-d:v1.0.1
   ```

2. **Docker Hub에서 사용 가능한 태그 확인**
   - https://hub.docker.com/r/igor0670/ee-one-d/tags

3. **네트워크 문제인 경우**
   ```bash
   # Docker Hub 연결 테스트
   docker pull hello-world
   ```

### 업데이트 후 봇이 작동하지 않아요

**증상:** 새 버전으로 업데이트 후 오류 발생

**해결 방법:**

1. **데이터베이스 스키마 확인**

   버전 업데이트 시 데이터베이스 스키마가 변경될 수 있습니다. Prisma가 자동으로 스키마를 동기화합니다.

   ```bash
   # 로그에서 스키마 동기화 확인
   docker compose logs bot | grep -i "prisma"
   ```

2. **컨테이너 완전 재시작**
   ```bash
   docker compose down
   docker compose pull
   docker compose up -d
   ```

3. **CHANGELOG 확인**

   [CHANGELOG.md](../CHANGELOG.md)에서 breaking changes 확인

---

## Discord 관련 문제

### 봇이 오프라인으로 표시돼요

**원인:**
- Discord API 연결 실패
- 잘못된 토큰
- 네트워크 문제

**해결 방법:**

1. **봇 로그 확인**
   ```bash
   docker compose logs -f bot
   ```

2. **토큰 재발급**

   Discord Developer Portal에서 토큰을 재발급하고 `.env` 업데이트:
   ```bash
   nano .env  # DISCORD_TOKEN 수정
   docker compose restart bot
   ```

3. **네트워크 확인**
   ```bash
   # Discord API 연결 테스트
   curl -I https://discord.com/api/v10/gateway
   ```

### 멘션이 작동하지 않아요 (공지사항, 커스텀 명령어)

**증상:** `@역할` 또는 `#채널`이 텍스트로만 표시됨

**원인:** 역할/채널 이름이 정확하지 않거나 공백 포함

**해결 방법:**

1. **정확한 이름 사용**
   ```
   잘못된 예: @공지 역할 (공백 포함)
   올바른 예: @공지역할
   ```

2. **역할 ID 직접 사용** (고급)
   ```
   <@&역할ID>
   ```

3. **채널 링크**
   ```
   #채널이름 또는 <#채널ID>
   ```

### 봇이 DM을 보낼 수 없어요

**참고:** EE-ONE-D는 DM 기능을 지원하지 않습니다. 모든 기능은 서버 채널에서만 작동합니다.

---

## 기능별 문제

### 역할 패널 버튼이 응답하지 않아요

**증상:** 버튼 클릭 시 아무 반응 없음

**해결 방법:**

1. **패널 재발행**
   ```bash
   /panel publish <패널이름>
   ```

2. **봇 역할 위치 확인**

   Discord 서버 설정 → 역할에서 봇의 역할을 부여할 역할보다 위로 이동

3. **로그 확인**
   ```bash
   docker compose logs bot | grep -i "button"
   ```

### 커스텀 명령어 고급 기능이 작동하지 않아요

**v1.0.1 기능:** 줄바꿈, 랜덤, 임베드

**해결 방법:**

1. **줄바꿈:** `\n` 사용 (백슬래시+n)
   ```
   잘못된 예: 첫 줄
                둘째 줄
   올바른 예: 첫 줄\n둘째 줄
   ```

2. **랜덤:** `|||` 구분자 사용
   ```
   응답1|||응답2|||응답3
   ```

3. **임베드:** `EMBED:` 접두사 사용
   ```
   EMBED:제목|||내용
   ```

자세한 사용법은 [명령어 가이드](COMMANDS.md#커스텀-명령어-고급-기능)를 참고하세요.

### 디시인사이드 미리보기가 안 떠요

**증상:** DC 링크를 보내도 임베드가 생성되지 않음

**원인:**
- 메시지에 DC 링크 외 다른 텍스트 포함
- 갤러리가 비공개이거나 접근 제한
- 봇이 메시지를 삭제할 권한이 없음

**해결 방법:**

1. **링크만 단독으로 전송**
   ```
   잘못된 예: 이거 봐 https://gall.dcinside.com/...
   올바른 예: https://gall.dcinside.com/...
   ```

2. **봇 권한 확인**

   `Manage Messages` 권한 필요

---

## 데이터베이스 문제

### 데이터베이스 연결 실패

**증상:** `Can't reach database server` 오류

**해결 방법:**

1. **DB 컨테이너 상태 확인**
   ```bash
   docker compose ps
   ```

2. **DB 컨테이너가 실행 중이 아닌 경우**
   ```bash
   docker compose up -d db
   docker compose logs db
   ```

3. **DATABASE_URL 확인**

   `.env` 파일에서:
   ```env
   DATABASE_URL=postgresql://postgres:postgres@db:5432/eeoned?schema=public
   ```

### 데이터베이스 초기화 (데이터 삭제)

**주의:** 모든 데이터가 삭제됩니다!

```bash
# 1. 컨테이너 중지 및 제거
docker compose down

# 2. 볼륨 삭제
docker volume rm eeoned_db-data

# 3. 재시작
docker compose up -d
```

### 데이터베이스 백업 및 복원

**백업 생성:**
```bash
# SQL 덤프 생성
docker compose exec db pg_dump -U postgres eeoned > backup_$(date +%Y%m%d).sql

# 백업 확인
ls -lh backup_*.sql
```

**복원:**
```bash
# 데이터베이스 초기화 후
docker compose exec -T db psql -U postgres eeoned < backup_20260312.sql
```

### 마이그레이션 오류

**증상:** Prisma 마이그레이션 실패

**해결 방법:**

Docker 이미지에서는 `prisma db push`를 사용하여 스키마를 자동으로 동기화합니다. 일반적으로 수동 개입이 필요 없습니다.

**로컬 개발 시:**
```bash
npm run prisma:generate
npm run migrate:dev
```

---

## 추가 도움말

### 로그 레벨 변경

더 자세한 로그가 필요한 경우:

```env
# .env 파일
LOG_LEVEL=debug
```

재시작:
```bash
docker compose restart bot
```

### GitHub Issues

위 방법으로 해결되지 않는 문제는 GitHub Issues에 보고해주세요:

https://github.com/HelloJamong/EE-ONE-D/issues

**이슈 작성 시 포함할 정보:**
- 버전 정보 (Docker 이미지 태그)
- 오류 메시지 (로그)
- 재현 방법
- 환경 정보 (OS, Docker 버전)

### 커뮤니티 지원

- **GitHub Discussions**: https://github.com/HelloJamong/EE-ONE-D/discussions
- **Issues**: https://github.com/HelloJamong/EE-ONE-D/issues

---

## 관련 문서

- [명령어 가이드](COMMANDS.md)
- [Discord 봇 설정](discord-setup.md)
- [CHANGELOG](../CHANGELOG.md)
