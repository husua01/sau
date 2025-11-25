# SAU 플랫폼 - 5분 빠른 시작

## 1단계: 설치 (30초)

```bash
npm install
```

## 2단계: 환경 설정 (2분)

```bash
cp env.example .env.local
```

`.env.local` 파일에 다음 4개 키만 입력:

```env
SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
PINATA_API_KEY="your_key"
PINATA_SECRET_KEY="your_secret"
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID="your_project_id"
PRIVATE_KEY="0x..."
```

키 발급 방법은 `README.md` 참고

## 3단계: 실행 (30초)

```bash
npm run dev
```

브라우저에서 접속: http://localhost:3000

## 완료!

- NFT 생성: `/create` 페이지
- NFT 조회: `/access` 페이지

## 프로덕션 배포

```bash
npm run build
npm run start
```

---

**이제 사용할 준비가 완료되었습니다!**
