# EE-ONE-D
단일 Discord 길드에서 역할 선택·감사 로그·관리 슬래시 커맨드를 제공하는 통합 관리 봇입니다. Rocky Linux 9의 Docker VM 환경에서 실행하도록 설계되었습니다.

## 주요 기능
- 역할 선택 패널 (MULTI/SINGLE) 생성·게시·버튼 기반 역할 토글
- 관리자 설정 슬래시 커맨드(`/config`, `/panel`)와 감사 로그 DB/채널 동시 기록
- 커스텀 이모지 단독 메시지 자동 확대
- 디시인사이드 링크 단독 메시지 미리보기 임베드 (TTL 캐싱)

## 기술 스택
- Node.js 20 + TypeScript
- discord.js v14
- PostgreSQL + Prisma (타입 세이프 쿼리/마이그레이션을 위해 선택)
- Docker / docker-compose

## 사전 준비
1. **Discord Developer Portal**
   - 봇 토큰 발급, **Privileged Intents** 활성화: `SERVER MEMBERS INTENT`, `MESSAGE CONTENT INTENT`.
   - OAuth2 -> Bot 권한: `Manage Roles`, `Read Messages/View Channels`, `Send Messages`, `Manage Messages`, `Embed Links`.
2. **환경 변수 설정**
   - `.env.example`를 복사해 `.env`를 만들고 값 채우기.
   - `COMMAND_SCOPE`를 `guild`로 두면 `DISCORD_GUILD_ID`에 지정된 길드에만 슬래시 커맨드를 등록하고, `global`이면 전역 등록.
3. **의존성 설치**
   ```bash
   npm install
   npm run prisma:generate
   ```

## Docker 실행 (Rocky Linux 9 기준)
```bash
docker compose up --build -d
```
- `db` 컨테이너: PostgreSQL, 외부 포트 미노출, 볼륨 `db-data` 영구 저장.
- `bot` 컨테이너: 헬스체크 완료 후 기동, `.env`를 주입해 프로덕션 모드(`node dist/index.js`)로 실행.

## Prisma / DB
- 스키마: `prisma/schema.prisma` (길드 설정, 역할 패널, 감사 로그 등).
- 마이그레이션: `npm run migrate:dev` (개발), `npm run migrate:deploy` (배포 시).

## 슬래시 커맨드
- `/config set/show`: 관리자 채널, 패널 채널, 로그 채널 설정. `Administrator` 권한 + 설정된 admin 채널에서만 동작.
- `/panel create/add/remove/list/publish/set_message`: 역할 패널 생성/게시/관리.
- 버튼 `customId` 규칙: `rp:<panelId>:<itemId>`.

## 로그 시스템
- DB 기록 + 로그 채널 병행. 로그 채널이 없으면 DB만 기록.
- 이벤트: 음성 채널 입/퇴장, 메시지 삭제/수정, 멤버 입/퇴장, 역할 부여/회수, 설정 변경.

## 기타 메모
- 커스텀 이모지/디시 링크 자동 처리 기능은 **메시지 내용이 단독**일 때만 동작합니다.
- 추가 웹 콘솔 확장을 고려해 `modules`/`shared`로 구조를 분리했습니다.
