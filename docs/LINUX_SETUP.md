# Linux 설치 및 실행 가이드

## 1. Node.js 설치

### Ubuntu / Debian
```bash
sudo apt update
sudo apt install nodejs npm
```

### CentOS / RHEL
```bash
sudo yum install nodejs npm
```

### Arch Linux
```bash
sudo pacman -S nodejs npm
```

### 버전 확인
```bash
node --version  # v18.0.0 이상 권장
npm --version
```

---

## 2. 프로젝트 설정

```bash
# 프로젝트 폴더로 이동
cd DiscordBot

# 의존성 설치
npm install

# 환경변수 파일 생성
nano .env
```

`.env` 파일 내용:
```
DISCORD_TOKEN=여기에_봇_토큰_입력
```

---

## 3. 실행

### 일반 실행
```bash
npm start
```

### 개발 모드 (파일 변경 시 자동 재시작)
```bash
npm run dev
```

---

## 4. 백그라운드 실행 (PM2)

SSH 연결이 끊어져도 봇이 계속 실행됩니다.

### PM2 설치
```bash
sudo npm install -g pm2
```

### 봇 시작
```bash
pm2 start index.js --name "discord-bot"
```

### 유용한 PM2 명령어
```bash
pm2 list              # 실행 중인 프로세스 목록
pm2 logs discord-bot  # 로그 확인
pm2 restart discord-bot  # 재시작
pm2 stop discord-bot  # 중지
pm2 delete discord-bot  # 삭제
```

### 서버 재부팅 시 자동 시작
```bash
pm2 startup
pm2 save
```

---

## 5. 문제 해결

### 포트/방화벽 문제
Discord 봇은 **아웃바운드 연결**만 사용하므로 별도 포트 개방 불필요.

### 권한 오류
```bash
sudo chown -R $USER:$USER DiscordBot/
```

### Node.js 버전이 낮을 때
```bash
# nvm으로 최신 버전 설치
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```
