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

## 4. 백그라운드 실행

SSH 연결이 끊어져도 봇이 계속 실행됩니다.

### systemd 서비스

OS 레벨에서 프로세스를 관리하여 가장 안정적입니다.

#### 설치
```bash
cd DiscordBot
chmod +x scripts/linux/install-service.sh
./scripts/linux/install-service.sh
```

#### 관리 명령어
```bash
sudo systemctl status discord-bot   # 상태 확인
sudo systemctl start discord-bot    # 시작
sudo systemctl stop discord-bot     # 중지
sudo systemctl restart discord-bot  # 재시작
sudo systemctl enable discord-bot   # 자동 재시작
sudo systemctl is-enabled discord-bot # 자동 재시작 확인
journalctl -u discord-bot -f        # 실시간 로그
```

#### 특징
| 설정 | 기능 |
|------|------|
| `WantedBy=multi-user.target` | 서버 재부팅 시 자동 시작 |
| `Restart=always` | 크래시 시 자동 재시작 |
| `RestartSec=10` | 재시작 전 10초 대기 (무한루프 방지) |
| `After=network.target` | 네트워크 연결 후 시작 |

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
