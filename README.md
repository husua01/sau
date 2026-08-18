# SAU 플랫폼

**NFT 소유를 조건으로 하는 콘텐츠 열람 게이트**

생성과 동시에 자동 암호화, 복호화하려면 해당 NFT를 보유해야 함

> 이 문구는 의도적으로 좁습니다. "소유자만 접근 가능"이나 "완전 탈중앙화"라고 쓰지 않는
> 이유는 [보장 범위와 한계](#보장-범위와-한계)에 있습니다 — 먼저 읽어주세요.

---

## 개요 및 설명

### SAU란?

SAU는 **NFT를 생성하면 콘텐츠가 자동으로 암호화**되고, **복호화하려면 그 NFT를 보유해야 하는** 플랫폼입니다. NFT 발행은 지갑에서 컨트랙트를 직접 호출하지만, 조회·접근 확인·콘텐츠 업로드는 SIWE 인증을 거치는 `/api/unified` API를 경유하는 하이브리드 구조입니다.

> **정확히 무엇을 보장하는가 — 먼저 읽어주세요.**
> SAU가 강제하는 것은 **"최초 열람 시점의 게이트"** 입니다. "NFT를 갖지 않은 사람은
> 콘텐츠를 열 수 없다"는 참이지만, **"NFT를 판 사람은 더 이상 콘텐츠를 볼 수 없다"는
> 거짓입니다.** 아래 [보장 범위와 한계](#보장-범위와-한계)를 반드시 확인하세요.
> 이 구분을 오해하면 DRM이나 기밀 문서 공유 용도로 잘못 쓰게 됩니다.

### 핵심 특징

- **자동 암호화**: NFT 생성 시 Lit Protocol로 클라이언트에서 자동 암호화
- **NFT 기반 접근 제어**: 복호화 시점에 해당 NFT를 **최소 보유 기간 이상** 보유해야 함 (`hasHeldFor`, 기본 1시간 — 짧은 대여로 우회하는 경로 차단. 창작자는 예외)
- **하이브리드 구조**: NFT 생성(민팅)은 클라이언트에서 지갑으로 직접 컨트랙트를 호출하지만, NFT 목록 조회·소유권 확인·콘텐츠 업로드는 `/api/unified`를 거치며 SIWE(지갑 서명) 인증을 요구한다
- **영구 저장**: Arweave(콘텐츠, mainnet) + IPFS/Pinata(이미지)
- **NFT 거래 시 게이트 이전**: 새 소유자가 열람 자격을 획득 (단, 이전 소유자의 접근이 *회수되지는* 않음 — 아래 참고)

---

## 보장 범위와 한계

이 절은 마케팅 문구가 아니라 실제 위협 모델입니다. **구현 버그가 아니라 설계상 고칠 수
없는 항목**들이므로, 용도를 정하기 전에 읽어야 합니다.

### 강제되는 것 ✅

- NFT를 보유한 적 없는 사람은 암호문을 복호화할 수 없다 (Lit 임계값 암호화)
- 접근 조건·암호문 위치는 민팅 후 온체인에서 변조 불가 (`setTokenURI` 창작자 1회 한정)
- 남의 주소로 시작하는 tokenId는 민팅 불가 (암호문 선점 방지)
- 플랫폼이 접근 조건이 실제로 그 NFT를 가리키는지 검증해 경고를 표시

### 강제되지 않는 것 ❌

| 흔한 오해 | 실제 |
|---|---|
| "NFT를 팔면 이전 소유자는 못 본다" | **복호화는 되돌릴 수 없습니다.** 한 번 연 사람의 손에 있는 평문은 회수할 방법이 없습니다. 게이트는 *앞으로의* 복호화 요청만 막습니다. |
| "구매자만 볼 수 있는 1-of-1 콘텐츠" | **창작자는 원본 평문을 영구히 보유합니다.** 온체인 `contentHash`에 중복 검사가 없으므로 같은 콘텐츠를 새 tokenId로 몇 번이든 다시 민팅할 수 있습니다. |
| "소유자만 열 수 있다" | **완화됨.** 접근 조건이 `hasHeldFor`로 최소 보유 기간(기본 1시간)을 함께 확인하므로 짧은 대여로는 통과하지 못합니다. 다만 그 기간을 넘겨 빌리면 여전히 통과합니다 — 제거가 아니라 비용 상승입니다. |
| "탈중앙화되어 있다" | 복호화 키는 **Lit Protocol 네트워크**가 쥐고 있습니다. Lit이 종료하거나 네트워크를 리셋하면 **모든 콘텐츠가 영구히 복호화 불가능**해집니다. Arweave의 "영구 저장"은 키가 살아있을 때만 의미가 있습니다. → **창작자의 원본 파일이 유일한 복구 수단**이므로, 민팅 완료 화면에서 "복구 정보(JSON)"를 내려받고 원본을 함께 보관하세요. |
| "종단간 암호화라 운영자도 못 본다" | 암호화는 브라우저에서 일어나지만 **그 JavaScript는 운영자 서버가 매번 내려줍니다.** 운영자가 악의적이거나 배포가 침해되면 평문을 유출하는 코드를 보낼 수 있고 사용자는 알 수 없습니다. 웹앱인 이상 해결 불가입니다. |

### 되돌릴 수 없는 결정 ⚠️

- **암호문은 Arweave에 영구 공개됩니다.** 향후 암호 구현 취약점이나 양자컴퓨터로 깨지면
  **내릴 방법이 없습니다.** 삭제권·잊혀질 권리가 구조적으로 불가능합니다.
- **메타데이터는 항상 평문 공개입니다** — 파일명, 크기, MIME, 접근 조건, 창작자 주소,
  생성 시각. 암호화되는 것은 콘텐츠 본문뿐입니다.

### 따라서 적합/부적합한 용도

- ✅ 적합: 유료 콘텐츠의 열람 게이트, 커뮤니티 멤버십 자료, 수집형 디지털 굿즈
- ❌ **부적합**: 개인정보·의료·법률 기록, 기업 기밀, 유출 시 회수가 필요한 모든 것,
  DRM(재배포 방지), 삭제 요구에 응해야 하는 데이터

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
git clone https://github.com/husua01/sau.git
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

   - **민팅 완료 후 "복구 정보 내려받기"를 눌러 JSON을 저장하고, 원본 파일도 함께
     보관하세요.** Lit이 종료·리셋되면 이 둘이 유일한 복구 수단입니다.

2. **NFT 조회 페이지** (`/access`)
   - MetaMask 연결 (자동으로 NFT 목록 조회)
   - NFT 선택
   - "복호화" 버튼 클릭
   - MetaMask 서명 승인
   - 복호화된 데이터 확인

---

## 환경 변수 설정

### 필수 환경 변수 (6개)

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

##### 최소 보유 기간 (`NEXT_PUBLIC_MIN_HOLDING_SECONDS`, 선택 · 기본 3600)

```env
NEXT_PUBLIC_MIN_HOLDING_SECONDS="3600"
```

복호화하려면 NFT를 이 시간(초) 이상 **연속 보유**해야 합니다. `balanceOf > 0`만 보면
NFT를 몇 분 빌려 복호화하고 반납하는 경로가 열리기 때문입니다.

**⚠️ 트레이드오프 — 값을 정하기 전에 읽으세요.** 이 기간은 대여자뿐 아니라 **정상
구매자에게도 그대로 적용됩니다.** 1시간으로 두면 방금 구매한 사람도 1시간을 기다려야
콘텐츠를 열 수 있습니다. 창작자 본인은 컨트랙트에서 예외 처리되어 즉시 열람할 수
있습니다(이미 원본 평문을 갖고 있어 유출 위험이 없음).

- 값이 클수록: 대여 우회는 어려워지지만 구매 후 대기 시간이 길어짐
- `0`으로 두면: 대기 없음, 대신 짧은 대여로 우회 가능(옛 동작과 동일)
- 이 값은 **암호화 시점에 암호문의 접근 조건에 박힙니다.** 나중에 환경변수를 바꿔도
  이미 발행된 NFT의 조건은 변하지 않습니다(온체인 변조 불가와 같은 이유).

**⚠️ `datil-dev`는 절대 쓰지 마세요.** `datil-dev`는 키가 영구적이지 않은
일회성 개발 네트워크입니다 — 네트워크가 리셋되면 그걸로 암호화한 콘텐츠는
**영구히 복호화 불가능**해집니다. 실제로 배포·공유할 NFT라면 `datil-test`
또는 `datil`만 사용하세요.

---

#### 5. Arweave (콘텐츠 영구 저장, mainnet만 지원)

```env
ARWEAVE_HOST="arweave.net"
ARWEAVE_KEY="{\"kty\":\"RSA\",\"n\":\"...\",\"e\":\"AQAB\"}"
```

**발급 방법**:
1. https://arweave.app 접속
2. "Create Wallet" 클릭
3. JSON 키 다운로드
4. JSON 내용을 한 줄로 압축하여 복사

**⚠️ 필수값입니다.** `ARWEAVE_KEY`가 없으면 `src/lib/arweave.ts`가 즉시 throw하고,
텍스트나 파일이 포함된 민팅은 **전부 실패**합니다. 현재 아키텍처에서 암호화된 콘텐츠
본문의 저장소는 Arweave 하나뿐이며, IPFS(Pinata)는 NFT 이미지와 메타데이터 전용이라
Arweave를 대체하지 않습니다.

**⚠️ 이 지갑은 운영자가 대납하는 중앙화 지점입니다.** 모든 사용자의 업로드 비용이 이
키 하나에서 빠져나갑니다. 잔액이 떨어지면 전체 민팅이 멈추므로 AR 잔액을 주기적으로
확인하세요.

**⚠️ 업로드에는 결제 절차가 없습니다 — 적대적으로 소진될 수 있습니다.** 콘텐츠 업로드는
SIWE 서명(= 지갑 하나)만 있으면 통과하고, 지갑은 무료로 무한 생성됩니다. 현재 방어는
3단계입니다:

| 계층 | 한도 | 설정 |
|---|---|---|
| IP당 요청 수 | 10회/분 | `src/lib/rate-limit.ts` |
| 주소당 일일 바이트 | 200MB | `MAX_CONTENT_MB_PER_ADDRESS_PER_DAY` |
| **전역 일일 바이트** | **2GB** | `MAX_CONTENT_MB_GLOBAL_PER_DAY` |

전역 상한이 핵심입니다 — 주소별 상한만으로는 지갑을 갈아타며 몇 번이든 다시 받을 수
있기 때문입니다. 이 값이 **운영자가 하루에 잃을 수 있는 최대치**이므로, AR 잔액과
비교해 감당 가능한 수준으로 맞추세요. 한도에 도달하면 정상 사용자도 503으로 막히지만,
지갑이 통째로 비는 것보다는 낫습니다(장애 > 파산).

**⚠️ 셋 다 인메모리라 서버리스 다중 인스턴스에서는 인스턴스별로만 유효합니다.** 실제
상한은 (설정값 × 동시 실행 인스턴스 수)에 가깝습니다. Arweave는 환불도 삭제도
불가능하므로, 공개 운영 전에 반드시 다음 중 하나로 승급하세요:

1. 사용자가 자기 Arweave 지갑(ArConnect 등)으로 직접 결제 — 근본 해결이지만 큰 작업
2. Upstash Redis / Vercel KV 기반 공유 카운터 — 인스턴스 분산 문제 해결
3. 초대·허용목록 기반 비공개 운영 — 가장 저렴한 임시 방편

#### 6. Vercel Blob (대용량 업로드 경유지)

```env
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
```

Vercel 서버리스 함수는 요청 바디가 4.5MB로 제한되어 있어 큰 파일을 서버로 직접 보낼 수
없습니다. 그래서 브라우저가 암호문을 Vercel Blob에 먼저 올리고, 서버는 그 URL을 받아
Arweave로 옮긴 뒤 Blob 사본을 삭제합니다(`/api/upload-content-blob` → `/api/unified`).

**⚠️ 필수값입니다.** 이 토큰이 없으면 텍스트·파일이 포함된 민팅이 **전부 실패**합니다.
크기와 무관하게 모든 콘텐츠가 이 경로를 지나갑니다.

**발급 방법**:
1. Vercel 대시보드 → Storage → Create → Blob
2. 생성된 스토어를 프로젝트에 연결하면 `BLOB_READ_WRITE_TOKEN`이 자동 주입됩니다
3. 로컬 개발 시에는 `vercel env pull .env.local`로 내려받거나 값을 직접 복사하세요

업로드 상한은 `src/lib/upload-limits.ts`의 `MAX_SHARED_CONTENT_BYTES`(현재 50MB)입니다.

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
           upload-content-blob/    # Vercel Blob 업로드 토큰 발급(대용량 우회)
           upload-nft-image/       # Pinata 이미지 업로드
           upload-nft-metadata/    # Pinata 메타데이터 업로드
    lib/                     # 라이브러리
        lit-protocol.ts            # Lit Protocol 암호화/복호화
        file-encryption.ts         # 암호화 진입점
        arweave.ts                 # Arweave 업로드
        pinata.ts                  # IPFS(Pinata) 업로드
        blockchain.ts              # 블록체인 조회 유틸
        auth.ts                    # SIWE 서명 검증
        rate-limit.ts              # API 레이트리밋
        upload-limits.ts           # 업로드 크기 상한 상수
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
- **접근 조건 자체는 창작자가 정합니다 — 플랫폼이 검증해 경고합니다.** 악의적 창작자가
  토큰 A를 팔면서 콘텐츠는 자기가 계속 보유할 토큰 B로 암호화해 둘 수 있습니다(구매자는
  복호화해봐야 알 수 있는데, 복호화하려면 사야 하므로 구매 전 검증이 불가능합니다).
  서버가 `describeAccessConditionMismatch()`로 조건이 정말 그 컨트랙트·그 tokenId를
  가리키는지 확인해 `/access` 화면에 경고를 띄웁니다. **경고가 보이면 구매하지 마세요.**
- **tokenId는 반드시 소유자 주소로 시작해야 합니다**(`mintOwn`의 `id >> 96` 검사).
  이 앱은 민팅 전에 콘텐츠를 tokenId로 암호화해 올리므로, 제약이 없으면 멤풀을 지켜본
  공격자가 같은 id로 앞질러 민팅해 콘텐츠를 가로챌 수 있습니다.

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
- 이미지가 4MB를 넘거나 jpeg/png/webp/gif가 아닌 형식은 아닌가요?

### Q3. 복호화가 되지 않아요
- MetaMask에서 서명을 승인하셨나요? 서명은 **최소 3번** 요청됩니다 — API 호출마다
  SIWE 인증 서명이 1회씩 필요하고(세션 재사용을 하지 않는 의도된 설계입니다),
  거기에 Lit 세션 서명 1회가 더해집니다. 예를 들어 NFT를 하나 선택하는 것만으로도
  `check_nft_ownership` + `get_nft_metadata` 각각 서명 1회씩, 복호화 시 Lit 세션
  서명 1회가 발생합니다
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
