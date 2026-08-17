// Lit Protocol 암호화 및 복호화 (클라이언트 사이드 전용)
// 동적 import로 빌드 오류 방지

import {
  LitAccessControlConditionResource,
  LitAbility,
  createSiweMessage,
  generateAuthSig,
} from "@lit-protocol/auth-helpers";
import type { LIT_NETWORKS_KEYS } from "@lit-protocol/types";

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

// 접근 제어 조건 생성
export function createAccessControlConditions(
  contractAddress: string,
  tokenId: string | number,
  chain: string = DEFAULT_LIT_CHAIN || "sepolia",
) {
  return [
    {
      contractAddress,
      standardContractType: "ERC1155",
      chain,
      method: "balanceOf",
      parameters: [":userAddress", tokenId.toString()],
      returnValueTest: {
        comparator: ">",
        value: "0",
      },
    },
  ];
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

    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
      {
        accessControlConditions,
        dataToEncrypt: content,
      },
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
        accessControlConditions,
        ciphertext,
        dataToEncryptHash,
        sessionSigs,
        chain: chain,
      },
      client,
    );

    return decryptedString;
  } catch (error) {
    console.error("[Lit] ❌ 복호화 실패:", error);
    throw error;
  }
}
