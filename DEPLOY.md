# SAU 플랫폼 배포 가이드

이 폴더는 프로덕션 배포에 필요한 필수 파일만 포함되어 있습니다.

## 폴더 구조

```
sau-deploy/
├── src/                    # 소스 코드
│   ├── app/               # Next.js 페이지 및 API
│   └── lib/               # 라이브러리
├── contracts/             # 스마트 컨트랙트
├── scripts/               # 배포 스크립트
├── public/                # 정적 파일
├── package.json           # 의존성
├── tsconfig.json          # TypeScript 설정
├── next.config.js         # Next.js 설정
├── hardhat.config.ts      # Hardhat 설정
├── env.example            # 환경 변수 예시
├── README.md              # 사용 가이드
└── DEPLOY.md              # 이 파일
```

## 배포 단계

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

```bash
cp env.example .env.local
# .env.local 파일을 편집하여 필수 키 입력
```

필수 환경 변수 (4개):
- SEPOLIA_RPC_URL (Alchemy)
- PINATA_API_KEY, PINATA_SECRET_KEY (Pinata)
- NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
- PRIVATE_KEY (MetaMask)

### 3. 스마트 컨트랙트 배포

```bash
# 컴파일
npm run compile

# Sepolia 테스트넷 배포
npm run deploy:testnet

# 배포 주소를 .env.local에 추가
# SAU_CONTRACT_ADDRESS="0x..."
```

### 4. 프로덕션 빌드

```bash
npm run build
```

### 5. 프로덕션 서버 실행

```bash
npm run start
```

## 배포 옵션

### Vercel 배포

```bash
# Vercel CLI 설치
npm i -g vercel

# 배포
vercel

# 프로덕션 배포
vercel --prod
```

환경 변수를 Vercel 대시보드에서 설정하세요.

### Docker 배포

```bash
# Docker 이미지 빌드
docker build -t sau-platform .

# 실행
docker run -p 3000:3000 --env-file .env.local sau-platform
```

### AWS/GCP/Azure 배포

1. 프로덕션 빌드: `npm run build`
2. `.next` 폴더와 `node_modules` 업로드
3. `npm run start` 실행

## 주의사항

- `.env.local` 파일을 절대 Git에 커밋하지 마세요
- 메인넷 배포 전 테스트넷에서 충분히 테스트하세요
- 스마트 컨트랙트는 배포 후 변경할 수 없습니다
- 프로덕션 환경에서는 별도의 보안 지갑을 사용하세요

## 문제 해결

빌드 실패 시:
```bash
rm -rf .next node_modules
npm install
npm run build
```

## 지원

문제가 있으시면 GitHub Issues를 생성해주세요.

