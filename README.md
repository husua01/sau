# SAU 플랫폼

**NFT 기반 탈중앙화 콘텐츠 플랫폼**

생성과 동시에 자동 암호화, NFT 소유자만 접근 가능

---

## 개요 및 설명

### SAU란?

SAU는 **NFT를 생성하면 콘텐츠가 자동으로 암호화**되고, **NFT 소유자만 복호화**할 수 있는 플랫폼입니다. NFT 발행은 지갑에서 컨트랙트를 직접 호출하지만, 조회·접근 확인·콘텐츠 업로드는 SIWE 인증을 거치는 `/api/unified` API를 경유하는 하이브리드 구조입니다.

### 핵심 특징

- **자동 암호화**: NFT 생성 시 Lit Protocol로 클라이언트에서 자동 암호화
- **NFT 기반 접근 제어**: 소유자만 복호화 가능
- **하이브리드 구조**: NFT 생성(민팅)은 클라이언트에서 지갑으로 직접 컨트랙트를 호출하지만, NFT 목록 조회·소유권 확인·콘텐츠 업로드는 `/api/unified`를 거치며 SIWE(지갑 서명) 인증을 요구한다
- **영구 저장**: Arweave(콘텐츠, mainnet) + IPFS/Pinata(이미지)
- **NFT 거래 시 권한 자동 이전**: 새 소유자가 자동으로 접근 권한 획득

### 기술 스택

| 구성 요소 | 기술 |
|----------|------|
| **블록체인** | Ethereum Sepolia (ERC-1155) |
| **암호화** | Lit Protocol v6 SDK |
| **저장소** | Arweave (콘텐츠) + IPFS/Pinata (이미지) |
| **프레임워크** | Next.js 14 + TypeScript 5 |
| **지갑** | MetaMask (`window.ethereum` 직접 연동) |

### 작동 방식

```
1. NFT 생성 (클라이언트 → 컨트랙트 직접 호출)
   > 콘텐츠를 Lit Protocol로 클라이언트에서 자동 암호화
   > 이미지/메타데이터를 Pinata IPFS에 업로드
   > 지갑으로 mintOwn() 직접 호출 (본인 지갑에만 발행)

2. NFT 조회 (/api/unified, SIWE 인증 필요)
   > 지갑 서명(SIWE)으로 본인 확인
   > 이벤트 스캔으로 보유 NFT 목록 조회

3. 데이터 접근
   > "복호화" 버튼 클릭 → MetaMask 서명(SIWE + Lit 세션 서명)
   > Lit Protocol로 복호화
   > 서명은 매 호출마다 새로 요청됩니다 (세션 재사용 없음). 지갑에서
     여러 번 서명 팝업이 뜨는 것이 정상입니다.
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

**필수 키 4개**를 설정하면 즉시 사용 가능 (컨트랙트를 아직 배포하지 않았다면 스마트 컨트랙트 배포 섹션도 함께 진행):
1. Alchemy RPC URL (블록체인)
2. Pinata API Keys (이미지 저장)
3. MetaMask 개인키 (컨트랙트 배포용)
4. Lit Protocol 네트워크 (`NEXT_PUBLIC_LIT_NETWORK`) — 암호화/복호화에 필수, 기본값 없음

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

#### 3. MetaMask 지갑 (컨트랙트 배포용)

```env
PRIVATE_KEY="0x1234567890abcdef..."
```

이 개인키는 `npm run deploy:*`로 **컨트랙트를 배포**할 때만 쓰입니다. NFT
발행(민팅)은 이 키와 무관하게, 사용자가 브라우저에서 연결한 MetaMask 지갑으로
직접 `mintOwn()`을 호출합니다.

**발급 방법**:
1. MetaMask 설치: https://metamask.io
2. 지갑 생성 (또는 기존 지갑 사용)
3. MetaMask  계정 상세  "개인 키 내보내기"
4. 비밀번호 입력 후 개인키 복사
5. `.env.local`에 붙여넣기

**테스트 ETH 받기**:
- https://sepoliafaucet.com
- 지갑 주소 입력  0.5 ETH 받기 (배포 + 가스비로 충분)

** 보안 주의**:
- 테스트용 지갑만 사용하세요
- 개인키를 절대 공유하지 마세요
- 메인넷 사용 시 별도 지갑 생성 권장

---

#### 4. Lit Protocol 네트워크 (암호화/복호화 필수)

```env
NEXT_PUBLIC_LIT_NETWORK="datil-test"
NEXT_PUBLIC_LIT_CHAIN="sepolia"
```

**⚠️ 기본값이 없습니다.** `NEXT_PUBLIC_LIT_NETWORK`가 비어 있으면 암호화/복호화가
즉시 에러와 함께 중단됩니다 — 조용히 다른 네트워크로 폴백하지 않습니다. 암호화와
복호화가 서로 다른 Lit 네트워크에서 일어나면 콘텐츠가 영구히 복호화 불가능해지기
때문입니다. 반드시 값을 명시하세요.

**참고**:
- `datil-test`: Lit Protocol 테스트 네트워크 (권장)
- `NEXT_PUBLIC_LIT_CHAIN`은 접근 제어 조건을 확인할 체인이며, 기본값은 `sepolia`입니다

**⚠️ `datil-dev`는 절대 쓰지 마세요.** `datil-dev`는 키가 영구적이지 않은
일회성 개발 네트워크입니다 — 네트워크가 리셋되면 그걸로 암호화한 콘텐츠는
**영구히 복호화 불가능**해집니다. 실제로 배포·공유할 NFT라면 `datil-test`
또는 `datil`만 사용하세요.

---

### 선택 환경 변수

#### 5. Arweave (영구 저장소, mainnet만 지원)

```env
ARWEAVE_HOST="arweave.net"
ARWEAVE_KEY="{\"kty\":\"RSA\",\"n\":\"...\",\"e\":\"AQAB\"}"
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

## 스마트 컨트랙트 배포

> ⚠️ 이 컨트랙트는 업그레이더블 구조가 아닙니다. 코드가 바뀌면(예: 이 저장소의
> `fix/sau-comprehensive-audit` 브랜치가 반영하는 접근 제어·tokenId 재사용 방지
> 수정) 반드시 **새 주소로 재배포**해야 하고, 기존에 배포되어 있던 컨트랙트 주소는
> 폐기해야 합니다. 아래는 실제 주소가 아니라 자리표시자(placeholder)입니다 —
> 직접 배포한 뒤 그 주소로 교체하세요.

### 컨트랙트 배포 (Sepolia 테스트넷)

```bash
# 컨트랙트 컴파일 및 테스트
npm run compile
npm test

# Sepolia 테스트넷에 배포
npm run deploy:testnet

# 배포 완료 후 출력 예시:
#  SAU 컨트랙트 배포 완료
#  주소: 0xYOUR_DEPLOYED_CONTRACT_ADDRESS
```

### 배포된 주소를 환경 변수에 추가

`scripts/deploy-unified.ts`가 배포 시 아래 값들을 `.env.local`에 **자동으로**
기록합니다 (수동으로 옮겨 적을 필요 없음):

```env
SAU_CONTRACT_ADDRESS="0xYOUR_DEPLOYED_CONTRACT_ADDRESS"
NEXT_PUBLIC_SAU_CONTRACT_ADDRESS="0xYOUR_DEPLOYED_CONTRACT_ADDRESS"
SAU_DEPLOYMENT_BLOCK="12345678"
```

`SAU_DEPLOYMENT_BLOCK`은 NFT 목록 조회(`/api/unified`)가 이벤트를 스캔하는
시작 블록으로 쓰이는 **필수값**입니다 — 없으면 조회 요청이 명시적으로 실패합니다.

### Etherscan에서 확인

```
https://sepolia.etherscan.io/address/<배포한 컨트랙트 주소>
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
npm run lint                   # ESLint
npm run typecheck              # TypeScript 타입 검사
npm run format                 # Prettier로 src/ 포맷

#  블록체인
npm run compile                # 스마트 컨트랙트 컴파일
npm test                       # 컨트랙트 + 인증 로직 테스트 (hardhat test)
npm run test:coverage          # 커버리지 리포트
npm run deploy:localnet        # 로컬 Hardhat 네트워크에 배포
npm run deploy:testnet         # Sepolia 테스트넷 배포
npm run deploy:mainnet         # Ethereum 메인넷 배포
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
 contracts/                    # 스마트 컨트랙트
    Sau1155.sol              # ERC-1155 NFT 컨트랙트
 src/
    app/                     # Next.js 페이지
       page.tsx                    # 메인 페이지
       create/page.tsx             # NFT 생성 (클라이언트 → 컨트랙트 직접 호출)
       access/page.tsx             # NFT 조회 (/api/unified 경유)
       api/
           unified/route.ts        # 조회/접근확인/업로드/비용계산 API
           upload-nft-image/       # Pinata 이미지 업로드
           upload-nft-metadata/    # Pinata 메타데이터 업로드
    lib/                     # 라이브러리
        lit-protocol.ts            # Lit Protocol 암호화/복호화
        file-encryption.ts         # 암호화 진입점
        arweave.ts                 # Arweave 업로드
        pinata.ts                  # IPFS(Pinata) 업로드
        blockchain.ts              # 블록체인 조회 유틸
        auth.ts                    # SIWE 서명 검증
        rate-limit.ts              # 업로드 API 레이트리밋
 scripts/
    deploy-unified.ts        # 유일한 배포 스크립트
 test/                        # Hardhat 컨트랙트/인증 테스트
 .env.local                   # 환경 변수 (생성 필요)
 README.md                    # 이 파일
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

### 암호화·복호화 관련 주의사항

- **`NEXT_PUBLIC_LIT_NETWORK`에 `datil-dev`를 쓰지 마세요.** `datil-dev`는
  Lit Protocol의 개발용 네트워크로 **키가 영구적이지 않습니다** — 네트워크가
  리셋되면 그 네트워크로 암호화된 콘텐츠는 **영구히 복호화가 불가능**해집니다.
  실제 사용자에게 발급하는 NFT라면 반드시 `datil-test`(테스트) 또는
  `datil`(프로덕션)을 사용하세요.
- **암호화되는 것은 콘텐츠 본문뿐입니다.** 파일명, 파일 크기, MIME 타입,
  그리고 어떤 컨트랙트·tokenId를 보유해야 열람 가능한지(접근 조건) 자체는
  NFT 메타데이터에 평문으로 들어가 IPFS/Arweave에 공개됩니다. Lit Protocol
  네트워크가 지키는 건 "콘텐츠 본문을 복호화할 수 있는 키"뿐이며, 메타데이터의
  나머지 필드는 애초에 비공개를 목표로 하지 않습니다.
- **PDF 미리보기(`/access`)는 창작자가 스스로 신고한 MIME 타입을 그대로
  믿습니다.** 복호화된 바이트가 실제로 유효한 PDF인지 서버·클라이언트 어느
  쪽도 검증하지 않고 `<iframe>`으로 렌더링합니다. 브라우저 내장 PDF 뷰어의
  자체 방어에 의존하는 구조이므로, 출처를 신뢰할 수 없는 NFT의 PDF는
  주의해서 여세요.
- 창작자만, 딱 1회 `setTokenURI`를 호출할 수 있고 이후 재설정이 컨트랙트
  레벨에서 리버트되므로, 접근 조건·암호문 위치(`ciphertextUrl`)는 민팅 이후
  **온체인에서 강제로 변조 불가능**합니다.

---

## 문제 해결

### Q1. NFT가 생성되지 않아요
- MetaMask에 Sepolia 네트워크가 추가되어 있나요?
- 지갑에 테스트 ETH가 있나요? (https://sepoliafaucet.com)
- `NEXT_PUBLIC_SAU_CONTRACT_ADDRESS`가 설정되어 있나요? (없으면 페이지 진입 시
  즉시 에러가 표시됩니다)
- `mintOwn()`은 누구나 호출할 수 있으므로 별도 권한(MINTER_ROLE)은 필요 없습니다

### Q2. 이미지가 업로드되지 않아요
- Pinata API 키가 올바르게 설정되었나요?
- API 키의 권한에 `pinFileToIPFS`가 포함되어 있나요?
- 이미지가 5MB를 넘거나 jpeg/png/webp/gif가 아닌 형식은 아닌가요?

### Q3. 복호화가 되지 않아요
- MetaMask에서 서명을 승인하셨나요? (SIWE 인증 서명과 Lit 세션 서명, 총 두 번
  요청될 수 있습니다)
- `NEXT_PUBLIC_LIT_NETWORK`가 설정되어 있나요? (암호화 때와 같은 네트워크여야
  합니다 — 다르면 영구히 복호화할 수 없습니다)
- Sepolia 네트워크에 연결되어 있나요?
- 해당 NFT를 소유하고 있나요?

### Q4. NFT 목록 조회가 실패해요
- `SAU_DEPLOYMENT_BLOCK`이 설정되어 있나요? (컨트랙트 재배포 시
  `npm run deploy:*`가 자동으로 기록합니다)
- RPC 요청 한도(무료 티어 레이트리밋)에 걸리지 않았나요?

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
