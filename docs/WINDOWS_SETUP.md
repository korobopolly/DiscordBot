# Windows 설치 및 실행 가이드

## 1. Node.js 설치

### 공식 설치 파일
[Node.js 공식 사이트](https://nodejs.org/)에서 LTS 버전 다운로드 및 설치

### 버전 확인
```cmd
node --version
npm --version
```
Node.js v18.0.0 이상 권장

---

## 2. 프로젝트 설정

```cmd
# 프로젝트 폴더로 이동
cd DiscordBot

# 의존성 설치
npm install
```

### 환경변수 파일 생성
프로젝트 폴더에 `.env` 파일 생성:
```
DISCORD_TOKEN=여기에_봇_토큰_입력
```

---

## 3. 실행

### 일반 실행
```cmd
npm start
```

### 개발 모드 (파일 변경 시 자동 재시작)
```cmd
npm run dev
```

---

## 4. 백그라운드 실행

CMD 창 없이 봇을 실행합니다.

### 실행 방법

| 파일 | 설명 |
|------|------|
| `scripts/windows/start-hidden.vbs` | 더블클릭하면 창 없이 백그라운드 실행 |
| `scripts/windows/stop-bot.bat` | 봇 종료 |

### Windows 시작 시 자동 실행 설정

1. `Win + R` 키 입력
2. `shell:startup` 입력 후 Enter
3. 열린 폴더에 `start-hidden.vbs`의 **바로가기** 생성

이렇게 하면 컴퓨터 부팅 시 자동으로 봇이 백그라운드에서 실행됩니다.

### 작동 원리

`start-hidden.vbs` 파일:
```vbs
Set objFSO = CreateObject("Scripting.FileSystemObject")
strFolder = objFSO.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = strFolder
WshShell.Run "cmd /c npm start", 0, False
```

| 코드 | 설명 |
|------|------|
| `GetParentFolderName` | 스크립트 위치 자동 감지 |
| `WshShell.Run ..., 0, False` | 창 숨김(0) + 비동기 실행(False) |

---

## 5. 문제 해결

### Node.js를 찾을 수 없음
환경변수 PATH에 Node.js 경로 추가 필요. 재설치 권장.

### npm install 오류
```cmd
# 캐시 정리 후 재시도
npm cache clean --force
npm install
```

### 봇이 실행되지 않음
`.env` 파일에 올바른 토큰이 입력되었는지 확인

### 백그라운드 실행 확인
작업 관리자(Ctrl+Shift+Esc) → 세부 정보 탭 → `node.exe` 프로세스 확인
