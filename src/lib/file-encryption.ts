import {
  initLitClient,
  encryptWithLit,
  createAccessControlConditions,
} from "./lit-protocol";

// 파일을 Blob으로 변환하는 함수
export function createTextFile(content: string, filename: string): File {
  const blob = new Blob([content], { type: "text/plain" });
  return new File([blob], filename, { type: "text/plain" });
}

// 파일을 ArrayBuffer로 읽는 함수
export async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ArrayBuffer를 Uint8Array로 변환
export function arrayBufferToUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Lit Protocol을 사용한 파일 암호화
export type EncryptionPayload = {
  encryptionType: "lit-protocol";
  ciphertext?: string;
  dataToEncryptHash?: string;
  accessControlConditions: any[];
  fileMetadata: {
    name: string;
    size: number;
    type: string;
    lastModified: number;
  };
  mimeType?: string;
  encoding?: "base64" | "utf-8" | "binary";
};

const FALLBACK_CHAIN =
  process.env.NEXT_PUBLIC_LIT_CHAIN ||
  (process.env.NEXT_PUBLIC_CHAIN_ID === "1" ? "ethereum" : "sepolia");

export async function encryptFile(
  file: File,
  tokenId: number | string | bigint,
  contractAddress?: string,
): Promise<EncryptionPayload> {
  const fileArrayBuffer = await fileToArrayBuffer(file);
  const fileUint8Array = arrayBufferToUint8Array(fileArrayBuffer);

  const finalContractAddress =
    contractAddress ||
    process.env.NEXT_PUBLIC_SAU_CONTRACT_ADDRESS ||
    process.env.SAU_CONTRACT_ADDRESS;
  if (!finalContractAddress) {
    throw new Error("NEXT_PUBLIC_SAU_CONTRACT_ADDRESS가 설정되지 않았습니다.");
  }

  const tokenIdString =
    typeof tokenId === "bigint" ? tokenId.toString() : tokenId.toString();

  const litChain = FALLBACK_CHAIN || "sepolia";
  const accessControlConditions = createAccessControlConditions(
    finalContractAddress,
    tokenIdString,
    litChain,
  );

  const fileMetadata = {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };

  const logLabel = `[Lit] encryptFile(tokenId=${tokenIdString})`;
  console.groupCollapsed(logLabel);
  console.log("🔧 입력 메타데이터", {
    contractAddress: finalContractAddress,
    chain: litChain,
    file: {
      name: fileMetadata.name,
      size: fileMetadata.size,
      type: fileMetadata.type,
    },
  });

  try {
    await initLitClient();
    const base64Payload = uint8ArrayToBase64(fileUint8Array);
    const litResult = await encryptWithLit(
      base64Payload,
      accessControlConditions,
    );

    if (!litResult) {
      throw new Error("Lit Protocol 암호화 결과가 비어 있습니다.");
    }

    console.log("✅ Lit Protocol을 통한 파일 암호화 완료");
    console.log("📦 Lit 암호화 결과", {
      ciphertextLength: litResult.ciphertext?.length ?? 0,
      dataToEncryptHash: litResult.dataToEncryptHash,
    });
    console.groupEnd();

    return {
      encryptionType: "lit-protocol",
      ciphertext: litResult.ciphertext,
      dataToEncryptHash: litResult.dataToEncryptHash,
      accessControlConditions,
      fileMetadata,
      mimeType: file.type,
      encoding: "base64",
    };
  } catch (error) {
    console.error("[Encrypt] Lit 암호화 실패 — 민팅을 중단합니다.", error);
    console.groupEnd();
    throw error;
  }
}

// 텍스트를 파일로 변환하고 암호화하는 통합 함수
export async function processTextAsFile(
  textContent: string,
  filename: string,
  _walletAddress: string,
  tokenId: number | string | bigint,
  contractAddress?: string, // ⚡ 컨트랙트 주소 추가
): Promise<EncryptionPayload> {
  const tokenIdString =
    typeof tokenId === "bigint" ? tokenId.toString() : tokenId.toString();

  const finalContractAddress =
    contractAddress ||
    process.env.NEXT_PUBLIC_SAU_CONTRACT_ADDRESS ||
    process.env.SAU_CONTRACT_ADDRESS;
  if (!finalContractAddress) {
    throw new Error("NEXT_PUBLIC_SAU_CONTRACT_ADDRESS가 설정되지 않았습니다.");
  }

  const litChain = FALLBACK_CHAIN || "sepolia";
  const accessControlConditions = createAccessControlConditions(
    finalContractAddress,
    tokenIdString,
    litChain,
  );

  const fileMetadata = {
    name: filename,
    size: textContent.length,
    type: "text/plain",
    lastModified: Date.now(),
  };

  const logLabel = `[Lit] processTextAsFile(tokenId=${tokenIdString})`;
  console.groupCollapsed(logLabel);
  console.log("🔧 입력 텍스트 정보", {
    contractAddress: finalContractAddress,
    chain: litChain,
    filename,
    length: textContent.length,
  });

  try {
    await initLitClient();
    const litResult = await encryptWithLit(
      textContent,
      accessControlConditions,
    );

    if (!litResult) {
      throw new Error("Lit Protocol 암호화 결과가 비어 있습니다.");
    }

    console.log("✅ Lit Protocol을 통한 텍스트 암호화 완료");
    console.log("📦 Lit 암호화 결과", {
      ciphertextLength: litResult.ciphertext?.length ?? 0,
      dataToEncryptHash: litResult.dataToEncryptHash,
    });
    console.groupEnd();

    return {
      encryptionType: "lit-protocol",
      ciphertext: litResult.ciphertext,
      dataToEncryptHash: litResult.dataToEncryptHash,
      accessControlConditions,
      fileMetadata,
      mimeType: "text/plain",
      encoding: "utf-8",
    };
  } catch (error) {
    console.error("[Encrypt] Lit 암호화 실패 — 민팅을 중단합니다.", error);
    console.groupEnd();
    throw error;
  }
}

// 복호화된 파일을 다운로드할 수 있는 Blob으로 변환
export function createDownloadableBlob(
  decryptedFile: Uint8Array,
  filename: string,
  mimeType: string = "application/octet-stream",
): Blob {
  return new Blob([decryptedFile], { type: mimeType });
}

// 파일 다운로드 함수
export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
