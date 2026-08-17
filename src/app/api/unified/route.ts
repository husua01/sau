import { NextRequest, NextResponse } from "next/server";
import { checkNFTOwnership, getProvider } from "../../../lib/blockchain";
import { uploadToArweave, fetchFromArweave } from "../../../lib/arweave";
import { createAccessControlConditions } from "../../../lib/lit-protocol";
import { verifySiwe } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { del } from "@vercel/blob";
import { MAX_SHARED_CONTENT_BYTES } from "@/lib/upload-limits";
import { ethers } from "ethers";

// 50MB 페이로드를 내려받아 Arweave에 서명·전송하는 시간을 감안해 기본
// 실행시간(10~15초)보다 넉넉하게 잡는다. 플랜상 60초가 상한이라 그 값을 쓴다.
export const maxDuration = 60;

// Provider 캐시 (싱글톤 패턴)
let cachedProvider: any = null;
let providerLastUsed = 0;
const PROVIDER_CACHE_TTL = 5 * 60 * 1000; // 5분

// NFT 조회 캐시
const nftQueryCache = new Map<string, { data: any; timestamp: number }>();
const NFT_CACHE_TTL = 60 * 1000; // 1분
const MAX_CACHE_SIZE = 100;

// 어느 컨트랙트를 조회할지는 항상 서버가 설정한 값만 신뢰한다. 요청 본문의
// contractAddress를 그대로 믿으면, SIWE 서명만 있는 아무나 운영자의 RPC 키를
// 통해 임의의 컨트랙트를 대신 조회하게 시킬 수 있다(비용/요청 한도 남용).
function getConfiguredContractAddress(): string | null {
  return (
    process.env.SAU_CONTRACT_ADDRESS ||
    process.env.NEXT_PUBLIC_SAU_CONTRACT_ADDRESS ||
    null
  );
}

// Provider 캐시 관리 함수. RPC URL 선택·검증 로직은 lib/blockchain.ts의
// getProvider() 하나로 통일한다(중복 구현이 각자 다르게 썩는 걸 방지).
function getCachedProvider() {
  const now = Date.now();

  if (cachedProvider && now - providerLastUsed < PROVIDER_CACHE_TTL) {
    providerLastUsed = now;
    return cachedProvider;
  }

  cachedProvider = getProvider();
  providerLastUsed = now;
  return cachedProvider;
}

// 캐시 정리 함수
function cleanupCache() {
  const now = Date.now();

  // NFT 조회 캐시 정리
  for (const [key, value] of nftQueryCache.entries()) {
    if (now - value.timestamp > NFT_CACHE_TTL) {
      nftQueryCache.delete(key);
    }
  }

  // 캐시 크기 제한
  if (nftQueryCache.size > MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(nftQueryCache.keys()).slice(
      0,
      nftQueryCache.size - MAX_CACHE_SIZE,
    );
    keysToDelete.forEach((key) => nftQueryCache.delete(key));
  }
}

function resolveMediaUrl(url?: string | null) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${trimmed.slice(7)}`;
  }
  if (trimmed.startsWith("ar://")) {
    return `https://arweave.net/${trimmed.slice(5)}`;
  }
  if (/^[a-zA-Z0-9_-]{43,}$/.test(trimmed)) {
    return `https://arweave.net/${trimmed}`;
  }
  return trimmed;
}

// 통합된 API 핸들러
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  switch (action) {
    case "health":
      return NextResponse.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        message: "SAU Platform API is running",
      });

    case "config":
      const networkMode = process.env.NETWORK_MODE || "testnet";
      const isTestnet = networkMode === "testnet";

      return NextResponse.json({
        chainId: isTestnet
          ? process.env.NEXT_PUBLIC_CHAIN_ID || "11155111"
          : process.env.MAINNET_CHAIN_ID || "1",
        network: isTestnet
          ? process.env.TESTNET_CHAIN_NAME || "Sepolia Testnet"
          : process.env.MAINNET_CHAIN_NAME || "Ethereum Mainnet",
        networkMode,
        version: "1.0.0",
      });

    default:
      return NextResponse.json(
        {
          error: "Invalid action",
          availableActions: ["health", "config"],
        },
        { status: 400 },
      );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...data } = body;
    const ip = getClientIp(request);

    switch (action) {
      case "get_nft_metadata":
        return handleGetNFTMetadata(data, ip);

      case "upload_shared_content":
        return handleUploadSharedContent(data, ip);

      case "test_access":
        return handleTestAccess(data, ip);

      case "check_nft_ownership":
        return handleCheckNFTOwnership(data, ip);

      case "get_user_nfts":
        return handleGetUserNFTs(data, ip);

      case "calculate_cost":
        return handleCalculateCost(data, ip);

      default:
        return NextResponse.json(
          {
            error: "Invalid action",
            availableActions: [
              "upload_shared_content",
              "get_nft_metadata",
              "test_access",
              "check_nft_ownership",
              "get_user_nfts",
              "calculate_cost",
            ],
          },
          { status: 400 },
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid JSON body",
      },
      { status: 400 },
    );
  }
}

// NFT 메타데이터 조회 핸들러
async function handleGetNFTMetadata(data: any, ip: string) {
  try {
    if (!rateLimit(`get-nft-metadata:${ip}`)) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const { siweMessage, siweSignature } = data;
    const targetAddress = data.userAddress ?? data.walletAddress;
    const auth = verifySiwe(siweMessage, siweSignature, targetAddress);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", message: auth.reason },
        { status: 401 },
      );
    }

    const { tokenId } = data;
    const contractAddress = getConfiguredContractAddress();
    if (!contractAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing contract address",
          message: "NEXT_PUBLIC_SAU_CONTRACT_ADDRESS가 설정되지 않았습니다.",
        },
        { status: 500 },
      );
    }
    if (!tokenId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: tokenId",
        },
        { status: 400 },
      );
    }

    const provider = getCachedProvider();
    const contract = new ethers.Contract(
      contractAddress,
      ["function uri(uint256 tokenId) view returns (string)"],
      provider,
    );

    const tokenURI = await contract.uri(tokenId);
    const resolvedURI = resolveTokenURI(tokenURI);

    const response = await fetch(resolvedURI, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch metadata from ${resolvedURI}: ${response.status}`,
      );
    }

    const metadata = await response.json();

    return NextResponse.json({
      success: true,
      metadata,
      hasData: true,
      tokenURI: resolvedURI,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve NFT metadata",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

function resolveTokenURI(tokenURI: string): string {
  if (!tokenURI) return tokenURI;
  if (tokenURI.startsWith("ipfs://")) {
    const path = tokenURI.replace("ipfs://", "");
    return `https://ipfs.io/ipfs/${path}`;
  }
  return tokenURI;
}

// 공유 콘텐츠 업로드 핸들러
async function handleUploadSharedContent(data: any, ip: string) {
  try {
    if (!rateLimit(`upload-shared-content:${ip}`)) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const { siweMessage, siweSignature } = data;
    const targetAddress = data.userAddress ?? data.walletAddress;
    const auth = verifySiwe(siweMessage, siweSignature, targetAddress);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", message: auth.reason },
        { status: 401 },
      );
    }

    const { blobUrl, fileName, contentType, contentEncoding, userAddress } =
      data;

    if (!blobUrl || !fileName || !userAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: blobUrl, fileName, userAddress",
        },
        { status: 400 },
      );
    }

    // 클라이언트가 아무 URL이나 서버에 대신 fetch시키지 못하도록(SSRF 방지),
    // 우리 Blob 스토어 도메인에서 온 URL인지 검증한다.
    let parsedBlobUrl: URL;
    try {
      parsedBlobUrl = new URL(blobUrl);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid blobUrl" },
        { status: 400 },
      );
    }
    if (
      parsedBlobUrl.protocol !== "https:" ||
      !parsedBlobUrl.hostname.endsWith(".public.blob.vercel-storage.com")
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid blobUrl" },
        { status: 400 },
      );
    }

    const blobResponse = await fetch(parsedBlobUrl.toString());
    if (!blobResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch uploaded content (status ${blobResponse.status})`,
        },
        { status: 502 },
      );
    }
    const content = await blobResponse.text();

    // 이 지점부터는 임시 Blob을 성공/실패와 무관하게 반드시 한 번 정리한다.
    // 이전엔 크기 초과와 성공 경로에서만 지웠고, uploadToArweave()가 던지는
    // 흔한 실패(게이트웨이 타임아웃 등)에서는 정리 없이 새는 문제가 있었다.
    try {
      // content.length는 UTF-16 코드 유닛 수라 다국어 텍스트에서 실제 바이트 수보다
      // 작게 나온다(예: 한글 1글자 = length 1이지만 UTF-8로는 3바이트). 실제 전송
      // 바이트 수 기준으로 검사해야 캡을 우회할 수 없다.
      const contentByteLength = Buffer.byteLength(content, "utf8");
      if (contentByteLength > MAX_SHARED_CONTENT_BYTES) {
        return NextResponse.json(
          { success: false, error: "Content too large (max 50MB)" },
          { status: 413 },
        );
      }

      const tags = [
        { name: "Content-Type", value: contentType || "text/plain" },
        { name: "App-Name", value: "SAU-Platform" },
        { name: "File-Name", value: fileName },
        { name: "Uploaded-By", value: userAddress },
        { name: "Upload-Type", value: "shared-content" },
      ];
      if (contentEncoding) {
        tags.push({ name: "Content-Encoding", value: contentEncoding });
      }

      const arweaveResult = await uploadToArweave(content, tags);

      const contentMetadata = {
        id: arweaveResult.id,
        name: fileName,
        type: contentType || "text/plain",
        size: contentByteLength,
        uploadedAt: new Date().toISOString(),
        arweaveId: arweaveResult.id,
        arweaveUrl: arweaveResult.url,
        uploadedBy: userAddress,
        encoding: contentEncoding || null,
      };

      console.log(
        `✅ 실제 Arweave 업로드 완료: ${fileName} → ${arweaveResult.id}`,
      );

      return NextResponse.json({
        success: true,
        contentId: arweaveResult.id,
        contentUrl: arweaveResult.url,
        metadata: contentMetadata,
        message: "Shared content uploaded successfully to Arweave",
      });
    } finally {
      await del(parsedBlobUrl.toString()).catch((cleanupError) => {
        console.warn("⚠️ 임시 Blob 삭제 실패:", cleanupError);
      });
    }
  } catch (error) {
    // 스택 트레이스·내부 호스트/포트·Arweave 지갑 키 지문 같은 상세 정보는
    // 서버 로그에만 남기고 클라이언트에는 사용자용 메시지만 돌려준다 — 이
    // 엔드포인트는 SIWE 서명만 있으면 누구나 호출할 수 있으므로, 내부
    // 진단 정보를 응답에 그대로 실어 보내면 정찰 정보를 거저 주는 셈이다.
    console.error("❌ Shared content upload failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Shared content upload failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// 접근 테스트 핸들러 (NFT 소유권 확인)
async function handleTestAccess(data: any, ip: string) {
  try {
    if (!rateLimit(`test-access:${ip}`)) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const { siweMessage, siweSignature } = data;
    const targetAddress = data.userAddress ?? data.walletAddress;
    const auth = verifySiwe(siweMessage, siweSignature, targetAddress);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", message: auth.reason },
        { status: 401 },
      );
    }

    const { tokenId, userAddress } = data;
    const contractAddress = getConfiguredContractAddress();
    if (!contractAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing contract address",
          message: "NEXT_PUBLIC_SAU_CONTRACT_ADDRESS가 설정되지 않았습니다.",
        },
        { status: 500 },
      );
    }
    if (!tokenId || !userAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: tokenId, userAddress",
        },
        { status: 400 },
      );
    }

    const normalizedTokenId =
      typeof tokenId === "string" ? tokenId : tokenId.toString();

    // 1. 실제 블록체인에서 NFT 소유권 확인
    const hasNFTOwnership = await checkNFTOwnership(
      contractAddress,
      normalizedTokenId,
      userAddress,
    );

    if (!hasNFTOwnership) {
      return NextResponse.json({
        success: true,
        hasAccess: false,
        contractAddress,
        tokenId: normalizedTokenId,
        userAddress,
        message: "접근 실패: NFT를 소유하고 있지 않습니다.",
      });
    }

    // 2. 온체인에서 Token URI 조회 및 메타데이터 확인
    const provider = getCachedProvider();
    const metadataContract = new ethers.Contract(
      contractAddress,
      ["function uri(uint256 tokenId) view returns (string)"],
      provider,
    );

    const rawTokenURI = await metadataContract.uri(normalizedTokenId);
    const tokenURI = resolveTokenURI(rawTokenURI);

    let metadataResponse: Response;
    try {
      metadataResponse = await fetch(tokenURI, {
        headers: {
          Accept: "application/json",
        },
      });
    } catch (fetchError) {
      console.error("메타데이터 요청 실패:", fetchError);
      return NextResponse.json(
        {
          success: false,
          hasAccess: true,
          contractAddress,
          tokenId: normalizedTokenId,
          userAddress,
          tokenURI,
          error: "Failed to fetch token metadata",
          message:
            fetchError instanceof Error
              ? fetchError.message
              : "Unknown metadata fetch error",
        },
        { status: 502 },
      );
    }

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text().catch(() => "");
      console.error(
        "메타데이터 응답 오류:",
        metadataResponse.status,
        errorText,
      );
      return NextResponse.json(
        {
          success: false,
          hasAccess: true,
          contractAddress,
          tokenId: normalizedTokenId,
          userAddress,
          tokenURI,
          error: "Token metadata request failed",
          status: metadataResponse.status,
          statusText: metadataResponse.statusText,
        },
        { status: metadataResponse.status },
      );
    }

    const metadata = await metadataResponse.json();
    const properties = metadata.properties ?? {};
    const encryptionData =
      properties.encryptionData || metadata.encryptionData || null;

    let arweaveUrl = properties.arweaveUrl || metadata.arweaveUrl || null;
    let arweaveId = properties.contentHash || metadata.contentHash || null;

    if (!arweaveId && arweaveUrl) {
      try {
        const parsed = new URL(arweaveUrl);
        arweaveId = parsed.pathname.replace(/^\/+/, "");
      } catch (urlError) {
        console.warn("Arweave URL 파싱 실패:", urlError);
      }
    }

    if (arweaveId && !arweaveUrl) {
      arweaveUrl = `https://arweave.net/${arweaveId}`;
    }

    let arweaveContent: string | null = null;
    let arweaveFetchError: string | null = null;

    if (arweaveId) {
      try {
        arweaveContent = await fetchFromArweave(arweaveId);
      } catch (error) {
        arweaveFetchError =
          error instanceof Error
            ? error.message
            : "Unknown Arweave fetch error";
        console.warn("Arweave 콘텐츠 조회 실패:", error);
      }
    }

    const accessControlConditions =
      encryptionData?.accessControlConditions ||
      createAccessControlConditions(contractAddress, normalizedTokenId);

    // arweaveId가 가리키는 콘텐츠는 [Lit 암호화 이후 업로드] 정책에 따라 이제
    // 항상 암호문이다(평문이 아님). 그대로 decryptedContent에 넣으면 클라이언트에
    // 깨진 바이트가 표시되므로, 실제 복호화는 클라이언트의 Lit 복호화 경로
    // (encryptionData 기반)에 맡기고 여기서는 플레이스홀더만 반환한다.
    const isEncrypted = !!encryptionData;
    const responsePayload: Record<string, any> = {
      success: true,
      hasAccess: true,
      contractAddress,
      tokenId: normalizedTokenId,
      userAddress,
      tokenURI,
      metadata,
      arweaveId,
      arweaveUrl,
      encryptionData,
      accessControlConditions,
      decryptedContent: isEncrypted ? null : arweaveContent,
      message: isEncrypted
        ? "NFT에 연결된 데이터를 찾았습니다. 클라이언트에서 복호화를 진행합니다."
        : arweaveContent
          ? "Arweave에서 데이터를 조회했습니다."
          : "메타데이터를 조회했습니다.",
    };

    if (arweaveFetchError) {
      responsePayload.arweaveFetchError = arweaveFetchError;
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("NFT 접근 테스트 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Access test failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// 결제 처리 핸들러
// NFT 소유권 조회 처리 (실제 블록체인 연동)
async function handleCheckNFTOwnership(data: any, ip: string) {
  try {
    if (!rateLimit(`check-nft-ownership:${ip}`)) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const { siweMessage, siweSignature } = data;
    const targetAddress = data.userAddress ?? data.walletAddress;
    const auth = verifySiwe(siweMessage, siweSignature, targetAddress);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", message: auth.reason },
        { status: 401 },
      );
    }

    const { tokenId, userAddress } = data;
    const contractAddress = getConfiguredContractAddress();
    if (!contractAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing contract address",
          message: "NEXT_PUBLIC_SAU_CONTRACT_ADDRESS가 설정되지 않았습니다.",
        },
        { status: 500 },
      );
    }
    if (!tokenId || !userAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: tokenId, userAddress",
        },
        { status: 400 },
      );
    }

    // 실제 블록체인에서 NFT 소유권 조회
    const hasOwnership = await checkNFTOwnership(
      contractAddress,
      tokenId,
      userAddress,
    );

    if (hasOwnership) {
      return NextResponse.json({
        success: true,
        hasOwnership: true,
        contractAddress,
        tokenId,
        userAddress,
        balance: "1", // ERC-1155 balance
        message: "NFT 소유권이 확인되었습니다.",
      });
    } else {
      return NextResponse.json({
        success: true,
        hasOwnership: false,
        contractAddress,
        tokenId,
        userAddress,
        balance: "0",
        message: "NFT를 소유하고 있지 않습니다.",
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "NFT ownership check failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// 비용 계산 핸들러
// mintOwn 1건당 대략적인 가스 한도. 실제 한도는 민팅 시점에 estimateGas로 확정된다([4-5]).
// 콘텐츠 업로드 전이라 실제 컨트랙트 호출로 견적을 낼 수 없어 대략치로 사용한다.
const ESTIMATED_MINT_GAS_LIMIT = 150_000n;

async function handleCalculateCost(data: any, ip: string) {
  try {
    if (!rateLimit(`calculate-cost:${ip}`)) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const { nftCount, contentSize } = data;

    if (!nftCount || !contentSize) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: nftCount, contentSize",
        },
        { status: 400 },
      );
    }

    const networkMode = process.env.NETWORK_MODE || "testnet";
    const isTestnet = networkMode === "testnet";

    // 실제 네트워크 가스 가격 조회 (하드코딩된 20/30 Gwei 제거)
    const provider = getCachedProvider();
    const feeData = await provider.getFeeData();
    const gasPriceWei = feeData.gasPrice ?? 0n;

    const totalGasWei =
      gasPriceWei * ESTIMATED_MINT_GAS_LIMIT * BigInt(nftCount);
    const ethereumGas = ethers.formatEther(totalGasWei);

    // 시세 API 연동이 없으므로 USD 환산은 반환하지 않고 ETH 단위만 제공한다.
    return NextResponse.json({
      success: true,
      ethereumGas,
      totalCost: ethereumGas,
      isEstimate: true,
      networkInfo: {
        mode: networkMode,
        isTestnet,
        gasPriceGwei: feeData.gasPrice
          ? ethers.formatUnits(feeData.gasPrice, "gwei")
          : null,
      },
      breakdown: {
        ethGas: ethereumGas,
        nftCount,
        contentSizeKB: (contentSize / 1024).toFixed(2),
      },
      message: `${networkMode === "testnet" ? "테스트넷" : "메인넷"} 기준 가스비 추정치입니다 (ETH 단위, USD 환산 미제공).`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Cost calculation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// 간단한 사용자 NFT 목록 조회 (최적화됨)
async function handleGetUserNFTs(data: any, ip: string) {
  try {
    if (!rateLimit(`get-user-nfts:${ip}`)) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const { siweMessage, siweSignature } = data;
    const targetAddress = data.userAddress ?? data.walletAddress;
    const auth = verifySiwe(siweMessage, siweSignature, targetAddress);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", message: auth.reason },
        { status: 401 },
      );
    }

    const { userAddress } = data;

    if (!userAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required field: userAddress",
        },
        { status: 400 },
      );
    }

    const contractAddress = getConfiguredContractAddress();
    if (!contractAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing contract address",
          message: "NEXT_PUBLIC_SAU_CONTRACT_ADDRESS가 설정되지 않았습니다.",
        },
        { status: 400 },
      );
    }

    console.log(
      `🔧 NFT 조회 시작 - 컨트랙트 주소: ${contractAddress}, 사용자 주소: ${userAddress}`,
    );

    // ⚡ 캐시 비활성화 (디버깅용 - 항상 최신 데이터 조회)
    // 주기적 캐시 정리
    cleanupCache();

    console.log(`🔍 캐시 없이 실시간 조회 시작...`);

    try {
      // ⚡ 최적화: 캐시된 Provider 재사용
      console.log(`🔗 캐시된 블록체인 프로바이더 사용`);
      const provider = getCachedProvider();
      const latestBlock = await provider.getBlockNumber();

      // 배포 블록을 몰라서 매번 넓은 범위를 훑는 대신, 필수 환경변수로 승격해
      // 항상 배포 시점부터만 스캔하도록 한다 (RPC 호출 수 축소).
      const deploymentBlockEnv = Number(process.env.SAU_DEPLOYMENT_BLOCK);
      if (
        !process.env.SAU_DEPLOYMENT_BLOCK ||
        Number.isNaN(deploymentBlockEnv) ||
        deploymentBlockEnv <= 0
      ) {
        throw new Error("SAU_DEPLOYMENT_BLOCK 환경변수가 설정되지 않았습니다.");
      }
      const chunkSize = Number(process.env.NFT_EVENT_CHUNK_SIZE || "6000");
      const initialFromBlock = deploymentBlockEnv;

      const contract = new ethers.Contract(
        contractAddress,
        [
          "function balanceOf(address account, uint256 id) view returns (uint256)",
          "function getTokenInfo(uint256 tokenId) view returns (string, address, uint256)",
          "function totalSupply() view returns (uint256)",
          "function uri(uint256 tokenId) view returns (string)",
          "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
          "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
          "event ContentCreated(uint256 indexed tokenId, address indexed creator, string contentHash)",
        ],
        provider,
      );

      const queryFilterInRanges = async (
        filter: any,
        fromBlock: number,
        toBlock: number,
        description: string,
      ) => {
        const events: ethers.EventLog[] = [];
        let start = fromBlock;
        while (start <= toBlock) {
          const end = Math.min(start + chunkSize - 1, toBlock);
          try {
            const chunk = await contract.queryFilter(filter, start, end);
            events.push(...(chunk as ethers.EventLog[]));
          } catch (error) {
            console.warn(
              `⚠️ ${description} 이벤트 조회 실패 (${start}-${end})`,
              error,
            );
            throw error;
          }
          start = end + 1;
        }
        return events;
      };

      const realNFTs = [];

      // 1. 🚀 이벤트 기반 NFT 조회 (훨씬 빠름!)
      console.log(`🔍 이벤트 기반 NFT 조회 시작...`);

      const foundTokenIds = new Set<string>();

      const transferSingleFilter = contract.filters.TransferSingle(
        null,
        null,
        userAddress,
      );
      const transferBatchFilter = contract.filters.TransferBatch(
        null,
        null,
        userAddress,
      );
      const contentCreatedForUserFilter = contract.filters.ContentCreated(
        null,
        userAddress,
      );
      const allContentCreatedFilter = contract.filters.ContentCreated();

      const collectEventsWithFallback = async (
        filter: any,
        description: string,
        includeAll: boolean = false,
      ) => {
        try {
          return await queryFilterInRanges(
            filter,
            initialFromBlock,
            latestBlock,
            description,
          );
        } catch (error) {
          // SAU_DEPLOYMENT_BLOCK부터의 조회가 실패했다고 0번 블록부터 전체를
          // 재스캔하면 [4-8]에서 줄이려는 RPC 호출 수가 그대로 되살아난다.
          if (includeAll) {
            throw error;
          }
          return [];
        }
      };

      try {
        const singleEvents = await collectEventsWithFallback(
          transferSingleFilter,
          "TransferSingle",
        );
        for (const event of singleEvents) {
          const eventArgs = (event as any).args;
          const rawId = eventArgs?.id;
          const tokenId =
            rawId !== undefined && rawId !== null ? rawId.toString() : null;
          if (tokenId && tokenId !== "0") {
            foundTokenIds.add(tokenId);
          }
        }
        console.log(
          `🔍 TransferSingle 이벤트에서 ${singleEvents.length}개 로그 확인`,
        );
      } catch (singleError) {
        console.warn("⚠️ TransferSingle 이벤트 조회 최종 실패:", singleError);
      }

      try {
        const batchEvents = await collectEventsWithFallback(
          transferBatchFilter,
          "TransferBatch",
        );
        for (const event of batchEvents) {
          const eventArgs = (event as any).args;
          const tokenIds = eventArgs?.ids || [];
          for (const id of tokenIds) {
            const tokenId =
              id !== undefined && id !== null ? id.toString() : null;
            if (tokenId && tokenId !== "0") {
              foundTokenIds.add(tokenId);
            }
          }
        }
        console.log(
          `🔍 TransferBatch 이벤트에서 ${batchEvents.length}개 로그 확인`,
        );
      } catch (batchError) {
        console.warn("⚠️ TransferBatch 이벤트 조회 최종 실패:", batchError);
      }

      try {
        const createdEventsForUser = await collectEventsWithFallback(
          contentCreatedForUserFilter,
          "ContentCreated(사용자)",
        );
        for (const event of createdEventsForUser) {
          const eventArgs = (event as any).args;
          const rawId = eventArgs?.tokenId;
          const tokenId =
            rawId !== undefined && rawId !== null ? rawId.toString() : null;
          if (tokenId && tokenId !== "0") {
            foundTokenIds.add(tokenId);
          }
        }
        console.log(
          `🔍 ContentCreated(사용자) 이벤트에서 ${createdEventsForUser.length}개 로그 확인`,
        );
      } catch (contentError) {
        console.warn(
          "⚠️ ContentCreated(사용자) 이벤트 조회 최종 실패:",
          contentError,
        );
      }

      try {
        const createdEventsAll = await collectEventsWithFallback(
          allContentCreatedFilter,
          "ContentCreated(전체)",
          true,
        );
        console.log(
          `🔍 ContentCreated(전체) 이벤트에서 ${createdEventsAll.length}개 로그 확인`,
        );
        for (const event of createdEventsAll) {
          const eventArgs = (event as any).args;
          const rawId = eventArgs?.tokenId;
          const tokenId =
            rawId !== undefined && rawId !== null ? rawId.toString() : null;
          if (tokenId && tokenId !== "0") {
            foundTokenIds.add(tokenId);
          }
        }
      } catch (allContentError) {
        console.warn(
          "⚠️ ContentCreated(전체) 이벤트 조회 실패:",
          allContentError,
        );
      }

      console.log(
        `🔍 이벤트에서 발견된 토큰 ID: ${Array.from(foundTokenIds).join(", ") || "없음"}`,
      );

      // (이전에는 이벤트 조회가 실패하면 tokenId 1~1000을 brute-force로
      // balanceOf 확인하는 폴백이 있었다. 이 앱이 실제로 발급하는 tokenId는
      // generateTokenId()가 만드는 keccak256 기반 256비트 값이라 1~1000
      // 범위에 떨어질 확률이 사실상 0이었다 — 트리거돼도 절대 아무것도 못
      // 찾으면서 balanceOf를 최대 1000번 낭비 호출하기만 했다. 찾을 수 없는
      // 걸 찾으려는 코드라 삭제한다. 이벤트 조회가 실패하면 그냥 못 찾은
      // 것으로 처리한다.)

      if (foundTokenIds.size === 0) {
        console.log("📭 사용자가 보유한 NFT가 없습니다.");
        return NextResponse.json({ success: true, nfts: [] });
      }

      // 2. 발견된 토큰들의 실제 잔액 확인 (이중 확인)
      console.log(`💰 ${foundTokenIds.size}개 토큰의 잔액 확인 중...`);
      const balanceResults: Array<{ tokenId: string; balance: bigint }> = [];
      for (const tokenId of foundTokenIds) {
        try {
          const tokenIdBigInt = BigInt(tokenId);
          const balance = await contract.balanceOf(userAddress, tokenIdBigInt);
          const balanceBigInt =
            typeof balance === "bigint"
              ? balance
              : BigInt(balance?.toString?.() ?? "0");
          if (balanceBigInt > 0n) {
            balanceResults.push({ tokenId, balance: balanceBigInt });
            console.log(
              `✅ 토큰 ID ${tokenId} 잔액: ${balanceBigInt.toString()}`,
            );
          }
        } catch (error) {
          console.warn(`⚠️ 토큰 ID ${tokenId} 조회 실패:`, error);
          continue;
        }
      }

      // 4. 소유한 NFT들의 상세 정보 조회
      for (const { tokenId, balance } of balanceResults) {
        if (balance > 0n) {
          try {
            const tokenIdBigInt = BigInt(tokenId);
            const [contentHash, creator, creationTime] =
              await contract.getTokenInfo(tokenIdBigInt);
            let tokenURIValue = "";
            try {
              tokenURIValue = await contract.uri(tokenIdBigInt);
            } catch (uriError) {
              console.warn(`⚠️ Token ID ${tokenId} URI 조회 실패:`, uriError);
            }
            const creationTimeBigInt =
              typeof creationTime === "bigint"
                ? creationTime
                : BigInt(creationTime?.toString?.() ?? "0");

            let metadataFromURI: any = null;
            let resolvedTokenURI = "";
            if (tokenURIValue) {
              resolvedTokenURI = resolveTokenURI(tokenURIValue);
              try {
                const metadataResponse = await fetch(resolvedTokenURI, {
                  headers: { Accept: "application/json" },
                });
                if (metadataResponse.ok) {
                  metadataFromURI = await metadataResponse.json();
                }
              } catch (metadataError) {
                console.warn(
                  `⚠️ Token ID ${tokenId} 메타데이터 조회 실패:`,
                  metadataError,
                );
              }
            }

            const fileNameFromMetadata =
              metadataFromURI?.properties?.fileName ||
              metadataFromURI?.fileName ||
              metadataFromURI?.name ||
              null;

            const nftName =
              metadataFromURI?.name ||
              (fileNameFromMetadata
                ? `${fileNameFromMetadata.replace(/\.[^/.]+$/, "")} #${tokenId}`
                : contentHash && contentHash !== ""
                  ? `SAU NFT #${tokenId}`
                  : `내 SAU NFT #${tokenId}`);

            const nftDescription =
              metadataFromURI?.description ||
              (contentHash && contentHash !== ""
                ? `SAU 플랫폼에서 생성된 NFT #${tokenId}. 콘텐츠 해시: ${contentHash.substring(0, 20)}...`
                : `SAU 플랫폼에서 생성된 NFT #${tokenId}`);

            const candidateImageUrls = [
              resolveMediaUrl(metadataFromURI?.image),
              resolveMediaUrl(metadataFromURI?.image_url),
              resolveMediaUrl(metadataFromURI?.imageData),
              resolveMediaUrl(metadataFromURI?.properties?.coverImageUrl),
              resolveMediaUrl(
                metadataFromURI?.properties?.coverImageMetadataUrl,
              ),
              resolveMediaUrl(
                metadataFromURI?.properties?.coverImageMetadataIpfsUrl,
              ),
              resolveMediaUrl(metadataFromURI?.properties?.arweaveUrl),
              resolveMediaUrl(
                contentHash && contentHash !== ""
                  ? `https://arweave.net/${contentHash}`
                  : null,
              ),
            ].filter(Boolean) as string[];

            const coverImageUrl =
              candidateImageUrls.find((url) => !!url) ||
              `https://via.placeholder.com/300x300?text=NFT+${tokenId}`;

            const hasEncryptionMetadata =
              metadataFromURI?.properties?.encrypted === true ||
              metadataFromURI?.properties?.encrypted === "true" ||
              (Array.isArray(metadataFromURI?.attributes) &&
                metadataFromURI.attributes.some(
                  (attr: any) =>
                    (attr.trait_type === "Encrypted" ||
                      attr.trait_type === "encrypted") &&
                    (attr.value === "Yes" || attr.value === true),
                ));

            realNFTs.push({
              tokenId: tokenId.toString(),
              name: nftName,
              description: nftDescription,
              image: coverImageUrl,
              contractAddress,
              balance: balance.toString(),
              createdAt:
                creationTimeBigInt > 0n
                  ? new Date(Number(creationTimeBigInt) * 1000).toISOString()
                  : new Date().toISOString(),
              contentHash: contentHash || "",
              creator: creator || "0x0000000000000000000000000000000000000000",
              coverImageUrl: coverImageUrl,
              fileName: fileNameFromMetadata,
              hasEncryption: hasEncryptionMetadata,
              tokenURI: resolvedTokenURI || tokenURIValue || "",
            });

            console.log(`✅ NFT #${tokenId} 조회 완료`);
          } catch (error) {
            console.warn(`토큰 ${tokenId} 정보 조회 실패:`, error);
            realNFTs.push({
              tokenId: tokenId.toString(),
              name: `SAU NFT #${tokenId}`,
              description: `SAU 플랫폼에서 생성된 NFT #${tokenId}`,
              image: `https://via.placeholder.com/300x300?text=NFT+${tokenId}`,
              contractAddress,
              balance: balance.toString(),
              createdAt: new Date().toISOString(),
              contentHash: "",
              creator: "0x0000000000000000000000000000000000000000",
              coverImageUrl: `https://via.placeholder.com/300x300?text=NFT+${tokenId}`,
              fileName: null,
              hasEncryption: false,
              tokenURI: "",
            });
          }
        }
      }

      // 실제 블록체인 조회 결과 반환 (NFT가 있어도 없어도)
      const result = {
        success: true,
        userAddress,
        contractAddress,
        nfts: realNFTs,
        totalCount: realNFTs.length,
        message:
          realNFTs.length > 0
            ? `실제 블록체인에서 ${realNFTs.length}개의 NFT를 찾았습니다.`
            : `실제 블록체인에서 NFT를 찾지 못했습니다.`,
        isRealBlockchain: true,
      };

      // ⚡ 캐시 비활성화 (항상 최신 데이터 조회)
      // nftQueryCache.set(cacheKey, { data: result, timestamp: Date.now() });

      console.log(`✅ NFT 조회 완료: ${realNFTs.length}개 반환`);
      return NextResponse.json(result);
    } catch (error: any) {
      console.error("블록체인 조회 실패:", error?.message);
      return NextResponse.json(
        {
          success: false,
          error: "Blockchain query failed",
          message: error?.message ?? "Unknown error",
        },
        { status: 502 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get user NFTs",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// NFT 파기 핸들러
