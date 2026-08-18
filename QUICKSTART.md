# SAU 플랫폼 - 5분 빠른 시작

## 1단계: 설치 (30초)

```bash
npm install
```

## 2단계: 환경 설정 (2분)

```bash
cp env.example .env.local
```

`.env.local` 파일에 다음 키들을 입력:

```env
SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
PINATA_API_KEY="your_key"
PINATA_SECRET_KEY="your_secret"
PRIVATE_KEY="0x..."
NEXT_PUBLIC_LIT_NETWORK="datil-test"
ARWEAVE_KEY="{\"kty\":\"RSA\",\"n\":\"...\",\"e\":\"AQAB\"}"
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
```

`ARWEAVE_KEY`와 `BLOB_READ_WRITE_TOKEN`이 없으면 텍스트·파일이 포함된 민팅이
전부 실패합니다. `NEXT_PUBLIC_LIT_NETWORK`는 기본값이 없어 비어 있으면 암호화가
즉시 중단됩니다.

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
