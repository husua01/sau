import { NextRequest, NextResponse } from "next/server";
import { uploadImageToPinata, uploadMetadataToPinata } from "@/lib/pinata";
import { verifySiwe } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Vercel 서버리스 함수의 요청 바디 플랫폼 한도(4.5MB) 아래로 안전 마진을 둔다.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!rateLimit(`upload-nft-image:${ip}`)) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const imageFile = formData.get("image") as File;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const userAddress = formData.get("userAddress") as string;
    const siweMessage = formData.get("siweMessage") as string;
    const siweSignature = formData.get("siweSignature") as string;

    const auth = verifySiwe(siweMessage, siweSignature, userAddress);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", message: auth.reason },
        { status: 401 },
      );
    }

    if (!imageFile) {
      return NextResponse.json(
        {
          success: false,
          error: "No image file provided",
        },
        { status: 400 },
      );
    }

    if (imageFile.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { success: false, error: "File too large (max 4MB)" },
        { status: 413 },
      );
    }
    if (!ALLOWED_MIME.has(imageFile.type)) {
      return NextResponse.json(
        { success: false, error: "Unsupported media type" },
        { status: 415 },
      );
    }

    console.log(
      `🎨 NFT 이미지 업로드 시작: ${imageFile.name} (${imageFile.size} bytes)`,
    );

    // 1. 이미지를 Pinata IPFS에 업로드
    const imageResult = await uploadImageToPinata(imageFile);

    if (!imageResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Image upload failed: ${imageResult.error}`,
          message:
            "이미지 업로드에 실패했습니다. Pinata API 키를 확인해주세요.",
        },
        { status: 500 },
      );
    }

    // 2. OpenSea 표준 메타데이터 생성
    const metadata = {
      name: title || imageFile.name,
      description:
        description || `NFT created with SAU Platform - ${imageFile.name}`,
      image: imageResult.ipfsUrl, // ipfs://QmXxx...
      external_url: imageResult.pinataUrl, // https://gateway.pinata.cloud/ipfs/QmXxx...
      attributes: [
        {
          trait_type: "File Name",
          value: imageFile.name,
        },
        {
          trait_type: "File Size",
          value: `${imageFile.size} bytes`,
        },
        {
          trait_type: "Content Type",
          value: imageFile.type,
        },
        {
          trait_type: "Storage",
          value: "IPFS",
        },
        {
          trait_type: "Platform",
          value: "SAU",
        },
      ],
      properties: {
        files: [
          {
            uri: imageResult.ipfsUrl,
            type: imageFile.type,
          },
        ],
        category: "image",
      },
      // ERC-1155 표준 필드
      decimals: 0,
      background_color: "ffffff",
      animation_url: null,
      youtube_url: null,
    };

    // 3. 메타데이터를 Pinata IPFS에 업로드
    const metadataResult = await uploadMetadataToPinata(
      metadata,
      `metadata-${Date.now()}.json`,
    );

    if (!metadataResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Metadata upload failed: ${metadataResult.error}`,
          message: "메타데이터 업로드에 실패했습니다.",
        },
        { status: 500 },
      );
    }

    console.log("✅ NFT 이미지 및 메타데이터 업로드 완료:", {
      imageHash: imageResult.ipfsHash,
      metadataHash: metadataResult.ipfsHash,
    });

    // 4. 결과 반환
    return NextResponse.json({
      success: true,
      image: {
        hash: imageResult.ipfsHash,
        ipfsUrl: imageResult.ipfsUrl,
        gatewayUrl: imageResult.pinataUrl,
      },
      metadata: {
        hash: metadataResult.ipfsHash,
        ipfsUrl: metadataResult.ipfsUrl,
        gatewayUrl: metadataResult.pinataUrl,
      },
      // 기존 API와 호환성을 위한 필드들
      contentId: metadataResult.ipfsHash,
      contentUrl: metadataResult.pinataUrl,
      // NFT 발급에 필요한 정보
      imageUrl: imageResult.pinataUrl,
      metadataUrl: metadataResult.pinataUrl,
    });
  } catch (error) {
    console.error("❌ NFT 이미지 업로드 API 오류:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "NFT 이미지 업로드 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
