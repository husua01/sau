import { NextRequest, NextResponse } from "next/server";
import { uploadImageToPinata } from "@/lib/pinata";
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

    // 이 라우트는 커버 이미지만 올린다. 예전에는 여기서 이미지용 메타데이터 JSON을
    // 한 번 더 Pinata에 올렸는데, 실제 tokenURI로 쓰이는 메타데이터는
    // /api/upload-nft-metadata가 따로 만들기 때문에 그 JSON은 아무도 읽지 않았다
    // (민팅마다 쓰이지 않는 파일이 하나씩 IPFS에 영구히 쌓였다). 삭제했다.
    console.log("✅ NFT 커버 이미지 업로드 완료:", imageResult.ipfsHash);

    return NextResponse.json({
      success: true,
      image: {
        hash: imageResult.ipfsHash,
        ipfsUrl: imageResult.ipfsUrl,
        gatewayUrl: imageResult.pinataUrl,
      },
      imageUrl: imageResult.pinataUrl,
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
