// Lit Protocol 암호화 및 복호화 (클라이언트 사이드 전용)
// 동적 import로 빌드 오류 방지

import type { LIT_NETWORKS_KEYS } from "@lit-protocol/types";

// @lit-protocol/auth-helpers를 최상단에서 정적 import하면 이 모듈을 (간접적으로라도)
// 참조하는 모든 페이지의 First Load JS에 SDK 전체가 끌려들어온다. 실제로 필요한 곳은
// 세션 서명을 발급하는 getDecryptSessionSigs 하나뿐이라 그 안에서만 동적으로 로드한다.

const DEFAULT_LIT_CHAIN =
  process.env.NEXT_PUBLIC_LIT_CHAIN ||
  (process.env.NEXT_PUBLIC_CHAIN_ID === "1" ||
  process.env.NETWORK_MODE === "mainnet"
    ? "ethereum"
    : "sepolia");

// Lit 클라이언트 인스턴스 (싱글톤)
let litNodeClient: any = null;

// Lit 클라이언트 초기화 (브라우저에서만)
export async function initLitClient() {
  // 서버 사이드 체크
  if (typeof window === "undefined") {
    return null;
  }

  if (litNodeClient && litNodeClient.ready) {
    return litNodeClient;
  }

  try {
    // 동적 import로 Lit Protocol SDK 로드
    const LitJsSdk = await import("@lit-protocol/lit-node-client");

    const litNetwork = process.env.NEXT_PUBLIC_LIT_NETWORK;
    if (!litNetwork) {
      throw new Error("NEXT_PUBLIC_LIT_NETWORK가 설정되지 않았습니다.");
    }

    const debugEnabled =
      (process.env.NODE_ENV || "").toLowerCase() !== "production";

    litNodeClient = new LitJsSdk.LitNodeClient({
      litNetwork: litNetwork as LIT_NETWORKS_KEYS,
      debug: debugEnabled,
    });

    await litNodeClient.connect();

    return litNodeClient;
  } catch (error) {
    console.error("[Lit] ❌ 초기화 실패:", error);
    return null;
  }
}

// 최소 보유 기간(초). balanceOf > 0만 보면 NFT를 몇 분 빌려 복호화하고 반납하는 경로가
// 열리므로, 컨트랙트의 hasHeldFor로 "이만큼 계속 보유했는가"를 함께 확인한다.
// 값을 키우면 대여 방어는 강해지지만 구매자가 첫 열람까지 그만큼 기다려야 한다.
// (창작자는 컨트랙트에서 예외 처리되어 대기하지 않는다.)
export const MIN_HOLDING_SECONDS = Number(
  process.env.NEXT_PUBLIC_MIN_HOLDING_SECONDS ?? "3600",
);

const HAS_HELD_FOR_ABI = {
  name: "hasHeldFor",
  inputs: [
    { internalType: "address", name: "account", type: "address" },
    { internalType: "uint256", name: "tokenId", type: "uint256" },
    { internalType: "uint256", name: "minHoldSeconds", type: "uint256" },
  ],
  outputs: [{ internalType: "bool", name: "", type: "bool" }],
  stateMutability: "view",
  type: "function",
};

// 접근 제어 조건 생성.
//
// 이름은 그대로지만 반환 형태는 Lit의 evmContractConditions다(표준 ERC1155 balanceOf
// 검사로는 보유 기간을 볼 수 없어 커스텀 view 함수를 호출해야 하기 때문). SDK 파라미터
// 이름만 encryptWithLit/decryptWithLit 경계에서 매핑하고, 앱 내부에서는 계속
// "accessControlConditions"라는 도메인 용어를 쓴다.
export function createAccessControlConditions(
  contractAddress: string,
  tokenId: string | number,
  chain: string = DEFAULT_LIT_CHAIN || "sepolia",
  minHoldSeconds: number = MIN_HOLDING_SECONDS,
) {
  return [
    {
      contractAddress,
      functionName: "hasHeldFor",
      functionParams: [
        ":userAddress",
        tokenId.toString(),
        String(minHoldSeconds),
      ],
      functionAbi: HAS_HELD_FOR_ABI,
      chain,
      returnValueTest: {
        key: "",
        comparator: "=",
        value: "true",
      },
    },
  ];
}

// 메타데이터에 실린 accessControlConditions는 창작자가 직접 써 넣은 값이라 그대로
// 믿으면 안 된다. 토큰 A를 팔면서 콘텐츠는 자기가 계속 보유할 토큰 B로 암호화해 두면,
// 구매자는 구매 전에 확인할 방법이 없고(복호화해봐야 아는데 복호화하려면 사야 한다)
// 산 뒤에도 아무것도 열지 못한다. 조건이 정말 "이 컨트랙트의 이 토큰"을 가리키는지
// 서버가 대신 확인해 불일치를 알려준다. 문제가 없으면 null.
export function describeAccessConditionMismatch(
  conditions: unknown,
  contractAddress: string,
  tokenId: string,
): string | null {
  if (!Array.isArray(conditions) || conditions.length !== 1) {
    return "접근 조건이 표준 형식(단일 조건)이 아닙니다.";
  }
  const [c] = conditions as any[];

  if (
    typeof c?.contractAddress !== "string" ||
    c.contractAddress.toLowerCase() !== contractAddress.toLowerCase()
  ) {
    return `접근 조건이 이 NFT의 컨트랙트가 아닌 다른 주소(${c?.contractAddress})를 가리킵니다.`;
  }
  if (c?.functionName !== "hasHeldFor") {
    return "접근 조건이 보유 기간 검사(hasHeldFor)를 사용하지 않습니다. 대여로 우회될 수 있는 조건입니다.";
  }
  if (c?.functionParams?.[0] !== ":userAddress") {
    return "접근 조건이 요청자 본인의 보유 여부를 검사하지 않습니다.";
  }
  if (String(c?.functionParams?.[1]) !== String(tokenId)) {
    return `접근 조건이 이 NFT(#${tokenId})가 아닌 다른 토큰(#${c?.functionParams?.[1]})을 가리킵니다. 이 NFT를 소유해도 콘텐츠를 열 수 없습니다.`;
  }
  // functionAbi가 조작되면 Lit이 전혀 다른 함수를 호출하게 되므로 서명까지 확인한다.
  if (
    c?.functionAbi?.name !== "hasHeldFor" ||
    c?.functionAbi?.outputs?.[0]?.type !== "bool" ||
    (c?.functionAbi?.inputs ?? []).map((i: any) => i?.type).join(",") !==
      "address,uint256,uint256"
  ) {
    return "접근 조건의 함수 서명이 표준 hasHeldFor(address,uint256,uint256)가 아닙니다.";
  }
  if (
    c?.returnValueTest?.comparator !== "=" ||
    String(c?.returnValueTest?.value) !== "true"
  ) {
    return "접근 조건의 판정식이 표준(= true)이 아닙니다.";
  }
  const minHold = Number(c?.functionParams?.[2]);
  if (!Number.isFinite(minHold) || minHold < 0) {
    return "접근 조건의 최소 보유 기간이 올바르지 않습니다.";
  }
  return null;
}

// 데이터 암호화 (클라이언트 사이드 전용)
export async function encryptWithLit(
  content: string,
  accessControlConditions: any[],
): Promise<{ ciphertext: string; dataToEncryptHash: string } | null> {
  if (typeof window === "undefined") {
    console.error("[Lit] ❌ encryptWithLit은 브라우저에서만 실행 가능");
    return null;
  }

  try {
    const client = await initLitClient();
    if (!client) {
      throw new Error("Lit 클라이언트 초기화 실패");
    }

    // 동적 import로 Lit Protocol SDK 로드
    const LitJsSdk = await import("@lit-protocol/lit-node-client");

    // SDK 경계: 보유 기간을 보려면 커스텀 view 함수를 호출해야 해서
    // 표준 accessControlConditions가 아니라 evmContractConditions로 넘긴다.
    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
      {
        evmContractConditions: accessControlConditions,
        dataToEncrypt: content,
      } as any,
      client,
    );

    return {
      ciphertext,
      dataToEncryptHash,
    };
  } catch (error) {
    console.error("[Lit] ❌ 암호화 실패:", error);
    throw error;
  }
}

// Lit v6 세션 서명 발급 — 세션당 1회 서명으로 이후 복호화를 재사용 가능하게 한다.
export async function getDecryptSessionSigs(
  client: any,
  signer: any,
  chain: string,
) {
  const {
    LitAccessControlConditionResource,
    LitAbility,
    createSiweMessage,
    generateAuthSig,
  } = await import("@lit-protocol/auth-helpers");

  return client.getSessionSigs({
    chain,
    resourceAbilityRequests: [
      {
        resource: new LitAccessControlConditionResource("*"),
        ability: LitAbility.AccessControlConditionDecryption,
      },
    ],
    authNeededCallback: async ({
      uri,
      expiration,
      resourceAbilityRequests,
    }: any) => {
      const toSign = await createSiweMessage({
        uri,
        expiration,
        resources: resourceAbilityRequests,
        walletAddress: await signer.getAddress(),
        nonce: await client.getLatestBlockhash(),
        litNodeClient: client,
      });
      return generateAuthSig({ signer, toSign });
    },
  });
}

// 데이터 복호화 (클라이언트 사이드 전용)
export async function decryptWithLit(
  ciphertext: string,
  dataToEncryptHash: string,
  accessControlConditions: any[],
  chain: string = DEFAULT_LIT_CHAIN || "sepolia",
  signer?: any,
): Promise<string | null> {
  if (typeof window === "undefined") {
    console.error("[Lit] ❌ decryptWithLit은 브라우저에서만 실행 가능");
    return null;
  }

  if (!signer) {
    throw new Error(
      "decryptWithLit에는 세션 서명 발급을 위한 signer가 필요합니다.",
    );
  }

  try {
    const client = await initLitClient();
    if (!client) {
      throw new Error("Lit 클라이언트 초기화 실패");
    }

    // 동적 import로 Lit Protocol SDK 로드
    const LitJsSdk = await import("@lit-protocol/lit-node-client");

    const sessionSigs = await getDecryptSessionSigs(client, signer, chain);

    const decryptedString = await LitJsSdk.decryptToString(
      {
        // 암호화 때와 동일한 형태여야 한다 — 다르면 복호화가 실패한다.
        evmContractConditions: accessControlConditions,
        ciphertext,
        dataToEncryptHash,
        sessionSigs,
        chain: chain,
      } as any,
      client,
    );

    return decryptedString;
  } catch (error) {
    console.error("[Lit] ❌ 복호화 실패:", error);
    throw error;
  }
}
