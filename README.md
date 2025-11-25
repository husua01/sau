# SAU 플랫폼

**NFT 기반 탈중앙화 콘텐츠 플랫폼**

생성과 동시에 자동 암호화, NFT 소유자만 접근 가능

---

## 개요 및 설명

### SAU란?

SAU는 **NFT를 생성하면 콘텐츠가 자동으로 암호화**되고, **NFT 소유자만 복호화**할 수 있는 완전 탈중앙화 플랫폼입니다.

### 핵심 특징

- **자동 암호화**: NFT 생성 시 Lit Protocol로 자동 암호화
- **NFT 기반 접근 제어**: 소유자만 복호화 가능
- **완전 탈중앙화**: 클라이언트에서 직접 블록체인 조회
- **영구 저장**: Arweave + IPFS로 데이터 영구 보존
- **NFT 거래 시 권한 자동 이전**: 새 소유자가 자동으로 접근 권한 획득

### 기술 스택

| 구성 요소 | 기술 |
|----------|------|
| **블록체인** | Ethereum Sepolia (ERC-1155) |
| **암호화** | Lit Protocol v6.4.0 (Datil Network) |
| **저장소** | Arweave (콘텐츠) + IPFS/Pinata (이미지) |
| **프레임워크** | Next.js 14 + TypeScript 5 |
| **지갑** | MetaMask + WalletConnect |

### 작동 방식

```
1. NFT 생성
   > 콘텐츠 자동 암호화 (Lit Protocol)
   > IPFS/Arweave에 저장
   > 블록체인에 NFT 발급

2. NFT 조회
   > 블록체인에서 직접 조회 (서버 없음)
   > MetaMask로 소유권 확인
   
3. 데이터 접근
   > "복호화" 버튼 클릭
   > MetaMask 서명 (1번만!)
   > Lit Protocol로 자동 복호화
```

---

## 사용 방법

### Step 1: 프로젝트 설치

```bash
# 저장소 클론
git clone https://github.com/your-username/sau.git
cd sau

# 의존성 설치
npm install
```

### Step 2: 환경 변수 설정

```bash
# env.example을 .env.local로 복사
cp env.example .env.local

# .env.local 파일을 편집하여 필수 키 입력
```

**필수 키 4개**만 설정하면 즉시 사용 가능:
1. Alchemy RPC URL (블록체인)
2. Pinata API Keys (이미지 저장)
3. WalletConnect Project ID (지갑 연결)
4. MetaMask 개인키 (NFT 발급용)

 **자세한 설정 방법은 아래 "환경 변수 설정" 섹션 참고**

### Step 3: 개발 서버 실행

```bash
# 개발 서버 시작
npm run dev

# 브라우저에서 접속
# http://localhost:3000
```

### Step 4: NFT 생성 및 조회

1. **NFT 생성 페이지** (`/create`)
   - MetaMask 연결
   - 텍스트 또는 파일 업로드
   - 커버 이미지 선택 (선택사항)
   - "NFT 생성" 버튼 클릭
   - MetaMask에서 트랜잭션 승인

2. **NFT 조회 페이지** (`/access`)
   - MetaMask 연결 (자동으로 NFT 목록 조회)
   - NFT 선택
   - "복호화" 버튼 클릭
   - MetaMask 서명 승인
   - 복호화된 데이터 확인

---

## 환경 변수 설정

### 필수 환경 변수 (4개)

`.env.local` 파일에 다음 키들을 설정해야 합니다:

#### 1. Alchemy RPC URL (블록체인 연결)

```env
SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY"
NEXT_PUBLIC_CHAIN_ID="11155111"
```

**발급 방법**:
1. https://www.alchemy.com 접속
2. 회원가입 후 로그인
3. "Create New App" 클릭
4. 네트워크: **Ethereum**  **Sepolia** 선택
5. API Key 복사  URL에 붙여넣기

**예시**:
```env
SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/abcd1234efgh5678"
```

---

#### 2. Pinata IPFS (이미지 저장)

```env
PINATA_API_KEY="your_api_key_here"
PINATA_SECRET_KEY="your_secret_key_here"
```

**발급 방법**:
1. https://app.pinata.cloud 접속
2. 회원가입 (무료 플랜 가능)
3. API Keys  "New Key" 클릭
4. Permissions: `pinFileToIPFS` 체크
5. Key Name: "SAU-Platform" 입력
6. Create Key 클릭
7. API Key, API Secret 복사

**무료 플랜**:
- 스토리지: 1GB
- 업로드: 월 1000개 파일
- 충분히 테스트 가능 

---

#### 3. WalletConnect (지갑 연결)

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID="your_project_id"
```

**발급 방법**:
1. https://cloud.walletconnect.com 접속
2. 회원가입 후 로그인
3. "Create New Project" 클릭
4. Project Name: "SAU Platform" 입력
5. Project ID 복사

**참고**: 
- WalletConnect Project ID는 클라이언트에 노출되어도 안전합니다
- `NEXT_PUBLIC_` 접두사 = 브라우저에서 사용 가능

---

#### 4. MetaMask 지갑 (NFT 발급용)

```env
PRIVATE_KEY="0x1234567890abcdef..."
```

**발급 방법**:
1. MetaMask 설치: https://metamask.io
2. 지갑 생성 (또는 기존 지갑 사용)
3. MetaMask  계정 상세  "개인 키 내보내기"
4. 비밀번호 입력 후 개인키 복사
5. `.env.local`에 붙여넣기

**테스트 ETH 받기**:
- https://sepoliafaucet.com
- 지갑 주소 입력  0.5 ETH 받기
- 약 10개의 NFT 발급 가능

** 보안 주의**:
- 테스트용 지갑만 사용하세요
- 개인키를 절대 공유하지 마세요
- 메인넷 사용 시 별도 지갑 생성 권장

---

### 선택 환경 변수

#### 5. Arweave (영구 저장소)

```env
ARWEAVE_MODE="testnet"
ARWEAVE_TESTNET_KEY="{\"kty\":\"RSA\",\"n\":\"...\",\"e\":\"AQAB\"}"
```

**발급 방법**:
1. https://arweave.app 접속
2. "Create Wallet" 클릭
3. JSON 키 다운로드
4. JSON 내용을 한 줄로 압축하여 복사

**참고**:
- Arweave는 선택사항입니다
- 설정하지 않아도 IPFS로 정상 작동

---

#### 6. Lit Protocol (기본값 사용 권장)

```env
NEXT_PUBLIC_LIT_NETWORK="datil-test"
NEXT_PUBLIC_LIT_CHAIN="sepolia"
```

**기본값**:
- `datil-test`: Lit Protocol 테스트 네트워크
- `sepolia`: Ethereum Sepolia 테스트넷

**참고**:
- 기본값 사용 권장
- 변경 시 Chronicle Yellowstone 네트워크 사용

---

### 환경 변수 설정 완료 확인

```bash
# 환경 변수 검증
npm run verify:env

# 예상 출력:
#  SEPOLIA_RPC_URL: 설정됨
#  PINATA_API_KEY: 설정됨
#  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: 설정됨
#  PRIVATE_KEY: 설정됨
```

---

## 스마트 컨트랙트 배포

### 컨트랙트 배포 (Sepolia 테스트넷)

```bash
# 컨트랙트 컴파일
npm run compile

# Sepolia 테스트넷에 배포
npm run deploy:testnet

# 배포 완료 후 출력:
#  SAU 컨트랙트 배포 완료
#  주소: 0x67d06971063f1aB8370F803bA520e136E9aF1bC3
```

### 배포된 주소를 환경 변수에 추가

```env
# .env.local에 추가
SAU_CONTRACT_ADDRESS="0x67d06971063f1aB8370F803bA520e136E9aF1bC3"
NEXT_PUBLIC_SAU_CONTRACT_ADDRESS="0x67d06971063f1aB8370F803bA520e136E9aF1bC3"
```

### Etherscan에서 확인

```
https://sepolia.etherscan.io/address/0x67d06971063f1aB8370F803bA520e136E9aF1bC3
```

---

## 모바일 최적화

SAU 플랫폼은 모바일 환경에 완벽히 최적화되어 있습니다:

- 반응형 디자인 (clamp() 사용)
- 터치 최적화 (버튼 최소 44px)
- 텍스트 자동 축약 (긴 Token ID 등)
- iOS 자동 확대 방지
- 가로 스크롤 없음

---

## 주요 명령어

```bash
#  개발
npm run dev                    # 개발 서버 (http://localhost:3000)
npm run build                  # 프로덕션 빌드
npm run start                  # 프로덕션 서버

#  블록체인
npm run compile                # 스마트 컨트랙트 컴파일
npm run deploy:testnet         # Sepolia 테스트넷 배포
npm run deploy:mainnet         # Ethereum 메인넷 배포

#  테스트
npm run test:env               # 환경 변수 검증
npm run test:eth               # 이더리움 테스트
npm run verify:env             # 설정 확인

#  유틸리티
npm run check:arweave          # Arweave 잔액 확인
npm run verify:service-wallet  # 서비스 지갑 확인
```

---

## 네트워크 환경

| 환경 | 네트워크 | Chain ID | 용도 |
|------|---------|----------|------|
| **로컬** | Hardhat | 31337 | 빠른 개발/테스트 |
| **테스트넷** | Sepolia | 11155111 | 실제 네트워크 검증 |
| **메인넷** | Ethereum | 1 | 실제 운영 |

**권장 워크플로우**:
```
로컬넷 개발  테스트넷 검증  메인넷 배포
```

---

## 프로젝트 구조

```
sau/
 contracts/           # 스마트 컨트랙트
    Sau1155.sol     # ERC-1155 NFT 컨트랙트
 src/
    app/            # Next.js 페이지
       page.tsx           # 메인 페이지
       create/page.tsx    # NFT 생성
       access/page.tsx    # NFT 조회
       api/unified/       # 통합 API
    lib/            # 라이브러리
        lit-protocol.ts    # Lit Protocol 암호화
        arweave.ts         # Arweave 저장
        pinata.ts          # IPFS 저장
        blockchain.ts      # 블록체인 연동
 scripts/            # 배포 스크립트
 .env.local          # 환경 변수 (생성 필요)
 README.md           # 이 파일
```

---

## 보안 주의사항

### 필수 보안 수칙

- `.env.local` 파일을 **절대** Git에 커밋하지 마세요
- 개인키(`PRIVATE_KEY`)를 **절대** 공유하지 마세요
- Pinata API Secret을 **절대** 노출하지 마세요
- 테스트넷에서 **충분히** 테스트하세요
- 메인넷 배포는 **신중하게** 진행하세요

### 개인키 관리

- 테스트용 지갑만 사용
- 소액만 보관 (0.1 ETH 이하)
- 메인넷 배포 시 별도 지갑 생성
- 하드웨어 지갑 사용 권장 (Ledger, Trezor)

---

## 추가 문서

- [탈중앙화 감사 보고서](DECENTRALIZATION_COMPLETE.md) - 95/100 달성
- [Lit Protocol 가이드](docs/LIT_PROTOCOL_GUIDE.md)
- [서비스 지갑 가이드](docs/SERVICE_WALLET_GUIDE.md)
- [성능 최적화](PERFORMANCE_OPTIMIZATION.md)

---

## Docker로 실행 (선택사항)

```bash
# Docker Compose로 실행
docker-compose up sau-dev

# 브라우저에서 접속
# http://localhost:3000
```

---

## 문제 해결

### Q1. NFT가 생성되지 않아요
- MetaMask에 Sepolia 네트워크가 추가되어 있나요?
- 지갑에 테스트 ETH가 있나요? (https://sepoliafaucet.com)
- MINTER_ROLE 권한이 있나요?

### Q2. 이미지가 업로드되지 않아요
- Pinata API 키가 올바르게 설정되었나요?
- API 키의 권한에 `pinFileToIPFS`가 포함되어 있나요?

### Q3. 복호화가 되지 않아요
- MetaMask에서 서명을 승인하셨나요?
- Sepolia 네트워크에 연결되어 있나요?
- 해당 NFT를 소유하고 있나요?

---

## 완료!

이제 SAU 플랫폼을 사용할 준비가 완료되었습니다!

1.  환경 변수 설정
2.  개발 서버 실행
3.  NFT 생성 및 조회
4.  데이터 암호화 및 복호화

**문의사항이 있으시면 이슈를 생성해주세요!**

---

## 라이선스

MIT License

---

**Made with  for Decentralization**
