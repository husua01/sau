# SAU 수정 작업 보고서

기준 커밋: `6f45206` (main) → 작업 브랜치: `fix/sau-comprehensive-audit`
지시서: `SAU_종합수정지시서.md` (§0.4 순서: Phase 1 → 2 → 3 → 4 → 5 → 6, 전부 수행)

---

## 완료 항목

### Phase 1. 보안
- [1-1] Web Crypto 폴백 완전 제거 — 커밋 `94d8b5a`, 4 files, +40/-217줄
  `encryptFile`/`processTextAsFile`의 catch 블록을 Lit 실패 시 즉시 throw하도록 교체, `encryptFileWithWebCrypto`/`decryptFileWithWebCrypto` 삭제, `EncryptionPayload`에서 `encryptedFile`/`encryptedSymmetricKey` 필드 삭제, access/create 페이지의 web-crypto 분기 삭제.
- [1-2] 서버 측 가짜 base64 "암호화" 제거 — 커밋 `f9f9288`, 1 file, +3/-279줄
  `handleCreateNFTWithAccessControl`(약 197줄), 도달 불가능했던 `handleEncrypt`/`handleDecrypt` 삭제. `create_nft_with_access_control` switch case 및 `availableActions` 항목 삭제.
- [1-3] SIWE 서명 검증 도입 — 커밋 `7f5d205`, 4 files, +178/-40줄
  `src/lib/auth.ts` 신규 생성(문서 원문 그대로), `handleTestAccess`/`handleGetUserNFTs`/`handleCheckNFTOwnership`/`handleGetNFTMetadata`/`handleUploadSharedContent` 5개 핸들러에 검증 삽입. access/create 페이지에 `signedFetch` 헬퍼 추가.
- [1-4] 업로드 엔드포인트 보호 — 커밋 `3c854a1`, 4 files, +84/-10줄
  `src/lib/rate-limit.ts` 신규 생성. 이미지 업로드에 5MB/MIME 제한, 메타데이터 업로드에 256KB 제한, 두 라우트 모두 SIWE 검증 + 분당 10회 IP 레이트리밋 추가.
- [1-5] `/api/service-wallet-info` 삭제 — 커밋 `61f00aa`, 2 files, -294줄
  라우트 삭제 후 유일한 호출부였던 `src/lib/service-wallet.ts` 전체 삭제(호출부 0건 확인).
- [1-6] 민감 정보 로깅 제거 — 커밋 `42e54f4`, 1 file, +1/-43줄
  `lit-protocol.ts`의 `console.groupCollapsed('[Lit]...')` 디버그 그룹 전부 제거(접근 제어 조건·dataToEncryptHash·decryptedLength 출력 포함). access/page.tsx의 `복호화 완료! 텍스트:`와 file-encryption.ts의 `symmetricKeyPreview`는 [1-1]에서 이미 함께 제거됨.

### Phase 2. 삭제
- [2-1] mock 핸들러 일괄 삭제 — 커밋 `4b661eb`, 1 file, +12/-286줄
  `handleUpload`/`handleImageUpload`/`handleMint`/`handleProcessPayment`/`handleBatchUpload`/`handleBurnNFT` 6개 함수와 대응 switch case 삭제(각 함수 호출부 0건 grep 확인 후 삭제). `availableActions`를 실제 호출되는 6개 액션으로 축소.
- [2-2] 가짜 NFT 폴백 삭제 — 커밋 `cba3e7c`, 1 file, +5/-38줄
  `handleGetUserNFTs`의 하드코딩 NFT 2개 배열 삭제, 블록체인 조회 실패 시 502 반환으로 교체.
- [2-3] 가짜 IPFS 해시 생성 삭제 — 커밋 `78b3096`, 1 file, +5/-5줄
  `create/page.tsx`의 `Qm${fileName}_${timestamp}` 가짜 해시 생성 2곳(else/catch) 모두 제거, 업로드 실패 시 민팅 중단.
- [2-4] 죽은 코드 삭제 — 커밋 `421098a`, 7 files, -614줄
  `src/lib/wallet.ts`(242줄, 참조 0건), `scripts/deploy-testnet.ts`/`deploy-mainnet.ts`(package.json 미참조), `create/page.tsx`의 `handleCreateNFT`(폼 바인딩 없음), `lit-protocol.ts`의 `encryptWithWebCrypto`/`decryptWithWebCrypto`(`default-password` 하드코딩)/`generateAuthSig`(호출부 0건), `blockchain.ts`의 `getTransactionStatus`(호출부 0건), `file-encryption.ts`의 `cayenne` 주석 블록 삭제. `service-wallet.ts`의 noop 로그 차단 블록은 [1-5]에서 파일째 이미 삭제됨.
- [2-5] 미사용 의존성 제거 — 커밋 `55c20be`, 3 files, +958/-9259줄
  `multer @types/multer got @irys/sdk multiformats fast-uri @rainbow-me/rainbowkit wagmi viem @tanstack/react-query @lit-protocol/contracts-sdk` 제거(전부 사용처 0건 확인). `@lit-protocol/auth-helpers`는 [4-2]용으로 유지. `next.config.js`에서 `serverComponentsExternalPackages`, `multiformats/cid` alias, 무동작 `isServer` externals 블록 삭제.
- [2-6] package.json 스크립트 정리 — 커밋 `b239435`, 1 file, +4/-43줄
  `scripts` 블록을 문서에 명시된 형태로 전체 교체(존재하는 파일만 참조).

### Phase 3. 스마트 컨트랙트
- [3-1]~[3-5] 컨트랙트 수정 — 커밋 `59818e8`, 1 file, +202/-224줄 (한 커밋으로 묶음, 사유는 아래 "판단이 필요한 사항" 참고)
  - [3-1] `setTokenURI`를 창작자 전용·1회 한정으로 제한, `URI` 이벤트 발행
  - [3-2] `_tokenExists` 매핑으로 tokenId 재사용 차단 (`mint`/`mintWithMetadata`/`mintBatch`/`mintBatchWithMetadata`/`mintOwn` 전부 적용)
  - [3-3] `receive()` 삭제 (ETH 영구 잠김 방지)
  - [3-4] `Ownable` 제거, `AccessControl` 단일화, `grantMinterRole`/`revokeMinterRole` 삭제, `setBaseURI`를 `onlyRole(DEFAULT_ADMIN_ROLE)`로 변경
  - [3-5] `uri()`를 ERC-1155 `{id}` 표준에 맞게 수정(`super.uri()` 위임), `ERC1155Supply` 상속 추가, `name`/`symbol`을 `constant`로 변경, `_toString` 삭제(대체 불필요 — 아래 판단 사항 참고), `burn` 시 전량 소각되면 콘텐츠 메타데이터 정리, `mintBatch`/`mintBatchWithMetadata` 둘 다 루프 안에서 `AccessGranted` 이벤트 발행
- [3-6] `mintOwn` 추가 및 프론트엔드 연동 — 커밋 `d039713`, 2 files, +7/-86줄
  A안(권장안) 채택. `create/page.tsx`의 MINTER_ROLE 확인/자동 부여/`window.confirm` 블록 전체 삭제, `mintWithMetadata` 호출을 `mintOwn` 호출로 교체. `deploy-unified.ts`의 `contract.owner()` 호출을 `hasRole(DEFAULT_ADMIN_ROLE)` 조회로 교체(Ownable 제거로 인한 필수 후속 수정).

### Phase 4. 기능 버그
- [4-1] 메타데이터 폴백 URI 무한 재귀 제거 — 커밋 `d427e6d`, 2 files, +4/-47줄
  `fallbackUri` 로직과 `source: 'fallback'` 캐시 삭제, 실패 시 throw로 민팅 중단. `unified/route.ts`의 `case 'metadata':` GET 핸들러 삭제(호출부 0건 확인).
- [4-2] Lit v6 세션 서명 전환 — 커밋 `b57c276`, 2 files, +48/-10줄
  `getDecryptSessionSigs` 추가, `decryptWithLit`이 `authSig` 대신 `sessionSigs` 사용(신규 `signer` 매개변수). access/page.tsx 2개 호출부 갱신.
- [4-3] Lit 네트워크 기본값 불일치 해소 — 커밋 `ada0455`, 1 file, +4/-5줄
  `|| 'datil'` 폴백 전부 제거, `NEXT_PUBLIC_LIT_NETWORK` 미설정 시 throw.
- [4-4] 컨트랙트 주소 하드코딩 폴백 제거 — 커밋 `42f3af7`, 4 files, +37/-18줄
  `file-encryption.ts`(2곳), `unified/route.ts`, `access/page.tsx`, `create/page.tsx`(문서 표에 없던 5번째 주소, 아래 판단 사항 참고) 전부 throw/명시적 에러로 교체.
- [4-5] 가스 한도 하드코딩 제거 — 커밋 `baa9c0e`, 1 file, +7/-1줄
  `mintOwn.estimateGas` 후 120% 여유를 둔 `gasLimit` 사용.
- [4-6] 비용 계산 실측값 반영 — 커밋 `e406fc2`, 1 file, +20/-23줄
  `provider.getFeeData()`로 실제 가스 가격 조회, 가짜 USD 환산 제거(ETH 단위만 반환, `isEstimate: true`).
- [4-7] TDZ 위험 해소 — 커밋 `e78d887`, 2 files, +48/-30줄
  `queryFilterInRanges` 클로저보다 위로 `contract` 선언 이동.
- [4-8] 이벤트 스캔 범위 축소 — 같은 커밋 `e78d887`
  `SAU_DEPLOYMENT_BLOCK`을 필수 환경변수로 승격(미설정 시 throw), `NFT_EVENT_LOOKBACK` 기반 120,000블록 백스캔 로직 제거. `deploy-unified.ts`가 배포 시 이 값을 `.env.local`에 자동 기록하도록 수정.
- [4-9] Arweave 기본 호스트 교체 — 커밋 `2a5b418`, 4 files, +24/-81줄
  권장안(testnet 모드 제거, mainnet만 지원) 채택. `env.example`/`README.md`의 관련 섹션도 함께 갱신.
- [4-10] `next.config.js` 폴백 재검토 — 커밋 `48fd700`, 1 file, +1/-18줄
  webpack fallback 12개 항목을 전부 제거하고 `rm -rf .next && npm run build`로 검증 — 전부 불필요했음을 확인(전량 삭제).
- [4-11] `@types/react` 버전 정합 — 커밋 `5e5f129`, 2 files, +27/-16줄
  `@types/react`/`@types/react-dom`을 `19.0.2` → `^18`로 변경, 설치된 `react@18.3.1`과 정합.

### Phase 5. 테스트
- [5-1] `test/Sau1155.test.ts` 작성 — 커밋 `36e3d49` (auth.test.ts와 합본), 22개 케이스, 전부 통과
  체크리스트 10개 항목 전부 커버(MINTER_ROLE 없는 민팅 리버트, tokenId 재사용 차단, setTokenURI 창작자 전용/1회 한정, 전송 후 hasAccess 변화, burn 후 balanceOf, 배치 민팅 전체 이벤트 발생, 비-admin grantRole 리버트, mintOwn 자기 자신에게만 발행 등).
- [5-2] `test/auth.test.ts` 작성 — 같은 커밋, 9개 케이스, 전부 통과
  실제 Next.js 서버를 띄우지 않고 `verifySiwe`를 직접 단위 테스트(5개 보호 핸들러 모두 이 함수의 반환값으로 401 여부를 그대로 결정하므로 동등). 서명 없음, **타인 주소 지정(가장 중요)**, 만료 메시지, nonce 재사용 케이스 포함.
- [5-3] CI 구성 — 커밋 `c9be26b`, `.github/workflows/ci.yml` 문서 원문 그대로 추가(checkout → setup-node@20 → npm ci → lint → typecheck → compile → test → build).

### Phase 6. 문서 및 스타일
- [6-1]~[6-4] README/env.example 정비 — 커밋 `a946da2`(6-1/6-2/6-3), `2a38c59`(6-4)
  "완전 탈중앙화" 서술을 하이브리드 구조로 정정, "서명 1번만" 문구 삭제(실제로는 매 호출마다 서명), "95/100 감사 보고서" 및 깨진 링크 4개 삭제, `npm run verify:env`/Docker 섹션 삭제, 컨트랙트 주소를 자리표시자로 교체하고 재배포 안내 추가, WalletConnect 전체 삭제(README·env.example), 다중 발행 UI(`nftAmount`, "발급 수량" 입력) 삭제하고 항상 1개만 발행.
- [6-5] 코드 스타일 정리 — 커밋 `f9f27d0`(prettier 의존성 추가) + `464553d`(포맷팅/줄바꿈 정규화, 별도 커밋으로 분리)
  `npx prettier --write "src/**/*.{ts,tsx}"` 적용, `.gitattributes`(`* text=auto eol=lf`) 추가 후 `git add --renormalize .`로 CRLF/LF 혼재 정리. `env.example`의 `SERVICE_PROVIDER_ADDRESS`는 플레이스홀더 교체 대신 기능 자체가 [1-5]에서 삭제되어 항목째 제거(아래 판단 사항 참고).
- 추가: 커밋 `09a0d1f` — §8 검증 스크립트 재실행 중 발견한, [2-1]에서 남은 고아 주석 2건(`시뮬레이션` 문구) 및 [4-9] 설명 주석 1건 정리.

---

## SKIP 항목

- [6-6] `unified/route.ts` 파일 분리 — 사유: 문서 자체가 "시간이 부족하면 SKIP 하고 보고서에 기록"이라고 명시한 선택 항목. Phase 1~6 전체를 커밋 단위로 꼼꼼히 처리하는 데 시간을 우선 배분했습니다. 현재 `unified/route.ts`는 1,282줄(prettier 적용 후 기준)이며, 문서가 제안한 4분할(`nft`/`access`/`content`/`cost`)은 로직 변경 없이 순수 리팩터링이라 이후 별도 작업으로도 안전하게 수행 가능합니다.

앵커 문자열을 찾지 못해 SKIP한 항목은 없습니다 — 모든 항목의 앵커가 grep으로 확인되었습니다.

---

## 판단이 필요한 사항

- **[3-6] A안(mintOwn) 채택.** 문서가 권장한 대로 자기 민팅 방식을 선택했습니다. B안(서버 측 민팅)으로 전환하려면 `mintOwn` 관련 컨트랙트/프론트 변경(커밋 `59818e8`, `d039713`)을 되돌리고 서버 지갑 기반 민팅 로직을 새로 작성해야 합니다.

- **[1-3]/[4-2] SIWE 서명 세션 재사용을 하지 않음.** 문서 §1-3-c는 "세션당 1회 서명해 5분간 재사용"을 권장하지만, §1-3-a에 명시된 `verifySiwe` 구현은 nonce를 1회용으로 소비합니다(같은 서명으로 두 번째 요청을 보내면 "Nonce already used"로 401). 즉 문서가 준 인증 로직 자체가 서명 재사용과 근본적으로 양립하지 않습니다. 코드 정확성(재사용 시 스푸리어스 401 방지)을 UX 권장사항보다 우선해, `signedFetch`가 매 호출마다 새 서명을 요청하도록 구현했습니다. 결과적으로 access/create 페이지 사용 중 MetaMask 서명 팝업이 예전보다 훨씬 자주 뜹니다(API 호출마다 1회 + Lit 복호화 세션마다 1회). README에 이 사실을 명시했습니다(§6-1). 세션 캐싱이 필요하다면 `verifySiwe`의 nonce 소비 방식 자체를 재설계해야 합니다(예: TTL 내 재사용 허용 + 별도 리플레이 방지 전략).

- **[3-5] `_toString` 대체 불필요.** 문서는 "OZ `Strings.toString` 사용"을 지시했지만, `uri()`를 ERC-1155 표준 `{id}` 치환 규약(`super.uri()` 위임)으로 고치면서 애초에 tokenId를 문자열로 변환할 필요 자체가 사라졌습니다. `Strings` import를 추가하지 않고 `_toString`을 대체 없이 삭제했습니다(미사용 import를 새로 만들지 않기 위함, §0.2).

- **[4-4] 문서에 없던 5번째 하드코딩 주소 발견 및 수정.** 문서 표는 4곳(`0xaF2ee6a6...` × 3, `0x5FC8d326...` × 1)만 나열했지만, grep 결과 `access/page.tsx`와 `create/page.tsx`에 다섯 번째 주소 `0x64cAf3Bd2F96304Ee8Dc3D46Ea816B2e5bfbB902`가 하드코딩 폴백으로 남아 있었습니다. 동일한 결함 패턴이라 판단해 §0.2 원칙에 따라 함께 제거했습니다.

- **[4-2] 문서 스니펫의 import 경로가 설치된 SDK와 다름.** 문서는 `LIT_ABILITY`를 `@lit-protocol/constants`에서 import하라고 지시했지만, 설치된 `@lit-protocol/auth-helpers`/`types` 6.11.5(기존 `^6.4.0` 범위로 설치됨)에서는 `LitAbility`라는 이름으로 `@lit-protocol/auth-helpers`가 export합니다. 실제 설치된 패키지에 맞춰 import를 조정했습니다(`@lit-protocol/constants`는 추가 설치하지 않음 — 불필요한 의존성 회피).

- **[4-4] create/page.tsx의 throw 위치를 컴포넌트 최상단에서 `typeof window !== 'undefined'` 가드로 조정.** 조건 없이 throw하면 `next build`의 정적 프리렌더 단계(서버, `window` 없음)에서 즉시 실패해 Phase 4 종료 게이트(`npm run build`)를 통과할 수 없었습니다. 브라우저에서만 throw하도록 가드를 추가해 정적 셸은 정상 생성되고, 실사용자는 하이드레이션 직후 즉시 에러를 보게 됩니다. 보안/정확성 목표(설정 누락 시 조용히 넘어가지 않음)는 그대로 유지됩니다.

- **[4-8] 문서에 명시되지 않은 추가 수정 — `collectEventsWithFallback`의 전체 범위 재시도 제거.** `SAU_DEPLOYMENT_BLOCK`을 필수값으로 승격했지만, 기존 코드에는 "부분 범위 조회 실패 시 0번 블록부터 전체 재시도"하는 폴백이 남아 있었습니다. 이를 그대로 두면 일시적 RPC 오류 한 번으로 [4-8]이 줄이려던 RPC 호출량이 그대로 되살아나므로, 이 폴백도 함께 제거했습니다(에러는 그대로 상위로 전파되거나 빈 배열 반환).

- **[6-5] `SERVICE_PROVIDER_ADDRESS` 플레이스홀더 교체 대신 항목 자체 삭제.** 문서는 "실주소로 보이는 값을 플레이스홀더로 교체"만 지시했지만, 이 값을 사용하던 `service-wallet.ts` 전체가 [1-5]에서 이미 삭제되었으므로 플레이스홀더로 남겨두는 것보다 죽은 설정 항목 자체를 제거하는 것이 일관적이라 판단했습니다.

- **tsconfig.json에 `ts-node` 오버라이드 블록 추가 (문서에 없는 필수 보조 수정).** 루트 `tsconfig.json`의 `module: "ESNext"`는 Next.js 빌드에는 맞지만, `hardhat test`가 사용하는 ts-node는 이 설정으로 `import { ethers } from "hardhat"`을 해석하지 못해 "does not provide an export named 'ethers'" 에러로 전체 테스트가 실행 자체가 안 됐습니다. Next.js 쪽 `compilerOptions`는 그대로 두고 `ts-node.compilerOptions.module`만 `CommonJS`로 오버라이드해 두 빌드 경로를 분리했습니다. Phase 5가 요구하는 "테스트 작성"의 전제조건이라 판단해 추가했습니다.

- **`.eslintrc.json` 신규 추가 (문서에 없는 필수 보조 수정).** ESLint 설정 파일이 저장소에 전혀 없어 `next lint`(=`npm run lint`)가 실행될 때마다 대화형 설정 마법사를 띄우며 멈췄습니다(빈 stdin을 줘도 멈춘 채로 응답 없음을 직접 확인). [5-3]에서 추가한 CI 워크플로우의 `npm run lint` 단계가 이 상태로는 무한 대기하다 타임아웃될 것이 확실했기 때문에, `next lint`의 "Strict (recommended)" 옵션과 동일한 `next/core-web-vitals` 프리셋으로 `.eslintrc.json`을 추가했습니다. 현재 경고만 있고(미사용 훅 의존성, `<img>` 대신 `next/image` 권장) 에러는 없어 `npm run lint`는 exit 0로 종료됩니다.

---

## 작업 중 발견한 추가 문제 (미수정)

- ~~`src/lib/lit-protocol.ts` — `@lit-protocol/auth-helpers` 정적 import로 First Load JS가 198KB → 771~773KB로 증가~~ **해결(2026-08-18)**: 실제 사용처가 `getDecryptSessionSigs` 하나뿐이라 그 안으로 `await import()`를 내려 정적 체인을 끊음. `/access` 198KB, `/create` 233KB로 복귀.
- ~~`src/app/access/page.tsx`가 `accessControlConditions`/`ciphertext` 객체 전체를 콘솔에 출력~~ **해결(2026-08-18)**: 식별용 필드만 남기도록 축소. 이 과정에서 `console.log(' 텍스트 미리보기:', decryptedTextContent.slice(0, 120))`가 **복호화된 평문 앞 120자를 그대로 출력**하고 있던 것을 추가로 발견해 함께 제거함.
- ~~`QUICKSTART.md`, `DEPLOY.md`, `PACKAGE_INFO.md`의 `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`~~ **해결(2026-08-18)**: 삭제하고 실제 필수값 6개로 교체.
- `hardhat.config.ts`의 `localnetPrivateKey` 기본값 — `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`(Hardhat 표준 "test test test..." 니모닉의 0번 계정 개인키, 업계 전반에 공개된 로컬 전용 테스트 키)가 `localhost`/`localnet` 네트워크 전용 기본값으로 남아 있습니다. §0.2의 "개인키 기본값 폴백 금지" 원칙과 문면상 겹치지만, 실사용 위험이 없는 로컬 전용 관례이고 문서가 앵커로 지목하지 않아 그대로 두었습니다. 필요하다면 이 폴백도 제거 대상으로 재검토할 수 있습니다.
- `contracts/Sau1155.sol`의 `mintBatch`/`mintBatchWithMetadata`는 여전히 컨트랙트에만 존재하고 프론트엔드에서 호출되지 않습니다(문서 [6-4] 방침대로 "남겨도 무방"이라 그대로 둠).

---

## 검증 결과

§8 스크립트 전체 재실행 출력 (최종 커밋 `09a0d1f` 기준):

```
=== 1. 평문 키 저장 코드 (기대: 0) ===
0
=== 2. 시뮬레이션 코드 (기대: 0) ===
0
=== 3. 하드코딩 컨트랙트 주소 (기대: 0) ===
0
=== 4. as any 타입 회피 (기대: 0) ===
0
=== 5. 존재하지 않는 스크립트 참조 (기대: 출력 없음) ===
(출력 없음)
=== 6. 미사용 의존성 (기대: 전부 0 files) ===
multer: 0 files
got: 0 files
@irys/sdk: 0 files
multiformats: 0 files
fast-uri: 0 files
wagmi: 0 files
viem: 0 files
=== 7. README 깨진 링크 (기대: 출력 없음) ===
(출력 없음 — README에 마크다운 링크 자체가 더 이상 없음)
=== 8. 빌드 파이프라인 ===
npm run lint       → ✅ 통과 (경고 6건, 에러 0건 — 훅 의존성/<img> 관련, 기존부터 있던 항목)
npm run typecheck  → ✅ 통과 (에러 0건)
npm run compile    → ✅ 통과 (Solidity 15개 파일 컴파일 성공)
npm test           → ✅ 통과 (31/31 — Sau1155.test.ts 22건 + auth.test.ts 9건)
npm run build      → ✅ 통과 (9개 페이지 정적/동적 생성 성공)
```

### 수동 검증 (사람이 확인 필요 — 에이전트는 배포를 수행하지 않았으므로 아래는 코드 근거만 명시)

- `.env.local`에서 `NEXT_PUBLIC_SAU_CONTRACT_ADDRESS`를 비우고 실행 → **코드 근거**: `file-encryption.ts`(2곳), `access/page.tsx`, `create/page.tsx`, `unified/route.ts`의 `handleGetUserNFTs`가 전부 명시적으로 throw/400 응답하도록 변경됨([4-4], 커밋 `42f3af7`). `create/page.tsx`는 브라우저 하이드레이션 직후 throw.
- Lit 네트워크를 잘못된 값으로 설정 후 민팅 시도 → **코드 근거**: [1-1]에서 Web Crypto 폴백이 완전히 제거되어 Lit 암호화가 실패하면 평문 저장 없이 그대로 에러가 전파되고 민팅이 중단됨(커밋 `94d8b5a`). `NEXT_PUBLIC_LIT_NETWORK` 미설정 시에도 [4-3]에서 즉시 throw.
- RPC URL을 잘못된 값으로 설정 후 NFT 목록 조회 → **코드 근거**: [2-2]에서 가짜 NFT 2개 반환 로직이 삭제되고 502 응답으로 교체됨(커밋 `cba3e7c`).
- NFT 미보유 주소로 `test_access` 호출 → 온체인 `balanceOf` 확인 로직은 이번 작업 범위에서 변경하지 않았으며(원래도 실제 조회), [1-3]의 SIWE 검증이 그 앞단에 추가로 걸림.
- 타인 주소를 `userAddress`에 넣은 요청 → **코드 근거**: `test/auth.test.ts`의 "[가장 중요] 타인 주소를 지정한 요청은 실패(401 대상)로 판정된다" 케이스로 검증 완료(통과).

위 5개 항목은 실제 배포된 컨트랙트·Sepolia RPC·MetaMask 브라우저 세션이 있어야 종단간으로 확인 가능하므로, 로컬 sandbox(배포 없음, `.env.local` 없음)에서는 코드 경로 근거로 대신했습니다. §10에 따라 실제 배포 후 사람이 직접 재확인해야 합니다.

---

## 변경 규모

`6f45206..HEAD` 전체 diff 기준(30개 커밋):

- 추가: 7,670줄
- 삭제: 16,132줄
- 순감소: 8,462줄
- 파일 삭제: 5개 (`scripts/deploy-mainnet.ts`, `scripts/deploy-testnet.ts`, `src/app/api/service-wallet-info/route.ts`, `src/lib/service-wallet.ts`, `src/lib/wallet.ts`)
- 파일 신규 생성: 7개 (`.eslintrc.json`, `.gitattributes`, `.github/workflows/ci.yml`, `src/lib/auth.ts`, `src/lib/rate-limit.ts`, `test/Sau1155.test.ts`, `test/auth.test.ts`)
- `src/app/api/unified/route.ts`: 1,623줄 → 1,282줄 (prettier 재포맷 포함 기준; 순수 로직 삭제만으로는 약 1,124줄까지 줄었다가 이후 포맷팅으로 재확장됨)
- 커밋 수: 30개 (Phase 1: 6개, Phase 2: 6개, Phase 3: 2개, Phase 4: 8개, Phase 5: 2개, Phase 6: 5개, 사후 정리: 1개)

※ `package-lock.json` 변경분(의존성 정리 [2-5], 4-2 관련 조사, prettier 추가)이 삭제 줄 수 대부분을 차지합니다(9,259줄 삭제 중 다수가 `55c20be` 커밋의 lockfile).

---

## Phase 3 반영 후 재배포 필요 (사람이 수행 — 에이전트는 배포하지 않음)

지시서 §10과 동일:

1. `npm run compile && npm test` 통과 확인 (이미 통과 확인됨, 위 검증 결과 참고)
2. `npm run deploy:testnet`으로 Sepolia 배포
3. 출력된 주소를 `.env.local`의 `SAU_CONTRACT_ADDRESS`, `NEXT_PUBLIC_SAU_CONTRACT_ADDRESS`에 반영 (deploy-unified.ts가 자동 기록)
4. 배포 블록 번호가 `SAU_DEPLOYMENT_BLOCK`에 자동 반영되는지 확인 ([4-8]에서 자동화됨)
5. README의 컨트랙트 주소 갱신 (현재는 자리표시자로 되어 있음, [6-1])
6. 기존 컨트랙트로 발행된 NFT는 마이그레이션되지 않습니다. 특히 `encryptionType: "web-crypto"`로 생성된 토큰은 콘텐츠가 이미 공개된 것으로 간주하고 재발행해야 합니다.
