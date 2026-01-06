# Discord Utility Bot

디스코드 서버를 위한 다목적 유틸리티 봇입니다.

## 기능

### 검색
| 명령어 | 설명 |
|--------|------|
| `/위키 [검색어]` | 위키피디아에서 검색 |
| `/나무위키 [검색어]` | 나무위키에서 검색 |

### 메시지 관리
| 명령어 | 설명 |
|--------|------|
| `/청소 [개수]` | 메시지 삭제 (1-100개) |
| `/청소 전체삭제:True` | 14일 이내 모든 메시지 삭제 |
| `/자동청소 설정 [채널] [간격]` | 주기적 자동 삭제 설정 |
| `/자동청소 해제 [채널]` | 자동 삭제 해제 |
| `/자동청소 목록` | 설정된 채널 확인 |

### 익명 기능
| 명령어 | 설명 |
|--------|------|
| `/디씨주소 [채널]` | 익명 글이 올라올 채널 설정 |
| `/유동 [내용]` | 디씨에 익명으로 글쓰기 |
| `/고백 [유저] [내용]` | 특정 유저에게 익명 DM |

## 설치

### 요구사항
- Node.js 18.0.0 이상
- Discord Bot Token

### 설치 방법
```bash
# 의존성 설치
npm install

# 환경변수 설정
# .env 파일 생성 후 토큰 입력
DISCORD_TOKEN=your_bot_token_here

# 실행
npm start

# 개발 모드 (파일 변경 시 자동 재시작)
npm run dev
```

## 봇 권한

Discord Developer Portal에서 다음 권한을 설정하세요:

### OAuth2 Scopes
- `bot`
- `applications.commands`

### Bot Permissions
- `Send Messages`
- `Manage Messages`
- `Read Message History`
- `Use Slash Commands`

## 파일 구조

```
DiscordBot/
├── index.js           # 메인 봇 코드
├── package.json       # 프로젝트 설정
├── .env               # 환경변수 (봇 토큰)
├── .gitignore         # Git 제외 파일
├── auto_clean.json    # 자동청소 설정 (자동 생성)
├── anon_settings.json # 익명 기능 설정 (자동 생성)
└── LINUX_SETUP.md     # 리눅스 설치 가이드
```

## 라이선스

MIT License
