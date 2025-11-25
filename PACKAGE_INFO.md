# SAU 플랫폼 배포 패키지

**버전**: 1.0.0  
**생성일**: 2025-11-25  
**패키지 크기**: 1.3MB (node_modules 제외)

---

## 포함된 구성요소

### 1. 소스 코드 (src/)
- `src/app/` - Next.js 페이지 및 API Routes
  - `page.tsx` - 메인 페이지
  - `create/` - NFT 생성 페이지
  - `access/` - NFT 조회 페이지
  - `api/` - 통합 API 엔드포인트
- `src/lib/` - 핵심 라이브러리
  - `lit-protocol.ts` - Lit Protocol 암호화
  - `arweave.ts` - Arweave 저장소
  - `pinata.ts` - IPFS/Pinata 저장소
  - `blockchain.ts` - 블록체인 연동
  - `file-encryption.ts` - 파일 암호화
  - `wallet.ts` - 지갑 연동

### 2. 스마트 컨트랙트 (contracts/)
- `Sau1155.sol` - ERC-1155 NFT 컨트랙트

### 3. 배포 스크립트 (scripts/)
- `deploy-unified.ts` - 통합 배포 스크립트
- `deploy-testnet.ts` - Sepolia 테스트넷 배포
- `deploy-mainnet.ts` - Ethereum 메인넷 배포

### 4. 설정 파일
- `package.json` - 의존성 및 스크립트
- `tsconfig.json` - TypeScript 설정
- `next.config.js` - Next.js 설정
- `hardhat.config.ts` - Hardhat 설정
- `env.example` - 환경 변수 템플릿

### 5. 문서
- `README.md` - 사용 가이드
- `DEPLOY.md` - 배포 가이드 (이 폴더에만 존재)
- `PACKAGE_INFO.md` - 패키지 정보 (이 파일)

---

## 제외된 항목

다음 항목들은 배포 패키지에 포함되지 않았습니다:

- `node_modules/` - npm install로 재생성
- `.next/` - npm run build로 재생성
- `cache/` - 컴파일 캐시 (자동 생성)
- `artifacts/` - 컨트랙트 컴파일 결과 (자동 생성)
- `typechain-types/` - TypeScript 타입 (자동 생성)
- `test/` - 테스트 파일
- `docs/` - 상세 문서
- 백업 파일 (*.backup, *.bak)
- 기타 문서 파일들

---

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정
cp env.example .env.local
# .env.local 파일 편집

# 3. 컨트랙트 배포
npm run compile
npm run deploy:testnet

# 4. 개발 서버 실행
npm run dev
```

---

## 프로덕션 배포

```bash
# 빌드
npm run build

# 프로덕션 서버 실행
npm run start
```

---

## 필수 환경 변수

배포 전 `.env.local`에 다음 4개 키를 반드시 설정하세요:

1. `SEPOLIA_RPC_URL` - Alchemy RPC URL
2. `PINATA_API_KEY`, `PINATA_SECRET_KEY` - Pinata IPFS
3. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` - WalletConnect
4. `PRIVATE_KEY` - MetaMask 개인키

자세한 설정 방법은 `README.md`를 참고하세요.

---

## 기술 사양

- **프레임워크**: Next.js 14.2.5
- **언어**: TypeScript 5.4.5
- **블록체인**: Ethereum Sepolia (ERC-1155)
- **암호화**: Lit Protocol v6.4.0
- **저장소**: Arweave + IPFS/Pinata
- **Node.js**: v20 이상 필요

---

## 파일 크기

- 소스 코드: ~1.3MB
- node_modules: ~600MB (설치 후)
- 빌드 결과: ~50MB (빌드 후)

---

## 라이선스

MIT License

---

**프로덕션 배포 준비 완료!**

