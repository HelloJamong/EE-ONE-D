# Discord 봇 계정/토큰 발급 가이드

EE-ONE-D를 배포하기 전에 Discord Developer Portal에서 애플리케이션과 봇 계정을 만들고 토큰을 발급합니다.

## 1. 애플리케이션 및 봇 생성
1. https://discord.com/developers/applications 접속 → **New Application**.
2. 이름: `EE-ONE-D` (원하는 이름 가능) → Create.
3. 왼쪽 메뉴 **Bot** → **Add Bot** → Yes.

## 2. 봇 토큰 발급
1. **Bot** 탭에서 **Reset Token** → 새 토큰 복사.
2. `.env`의 `DISCORD_TOKEN`에 붙여 넣기. (토큰은 절대 저장소/로그에 노출하지 말 것)

## 3. OAuth2 정보
- **Application ID**는 `.env`의 `DISCORD_CLIENT_ID` 값으로 사용.

## 4. 권한/인텐트 설정
1. **Bot** 탭:
   - **Privileged Gateway Intents**: `SERVER MEMBERS INTENT`, `MESSAGE CONTENT INTENT` 활성화.
2. **OAuth2 -> URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Manage Roles`, `Read Messages/View Channels`, `Send Messages`, `Manage Messages`, `Embed Links`.
   - 생성된 URL로 서버에 초대.

## 5. 슬래시 커맨드 범위 선택
- `.env`의 `COMMAND_SCOPE=guild`이면 `DISCORD_GUILD_ID`에 지정한 길드에만 커맨드 등록.
- 전역 등록이 필요하면 `COMMAND_SCOPE=global`로 변경 후 재시작.

## 6. 체크리스트
- [ ] `DISCORD_TOKEN` 설정
- [ ] `DISCORD_CLIENT_ID` 설정
- [ ] `DISCORD_GUILD_ID` (guild 스코프일 때만)
- [ ] 인텐트 2종 활성화
- [ ] 올바른 권한으로 봇 초대 완료
