import { NextRequest, NextResponse } from "next/server";
import { uploadMetadataToPinata } from "@/lib/pinata";
import { verifySiwe } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const MAX_JSON_BYTES = 256 * 1024; // 256KB

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!rateLimit(`upload-nft-metadata:${ip}`)) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { metadata, fileName, userAddress, siweMessage, siweSignature } =
      body || {};

    const auth = verifySiwe(siweMessage, siweSignature, userAddress);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", message: auth.reason },
        { status: 401 },
      );
    }

    if (!metadata || typeof metadata !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: "Missing metadata payload",
        },
        { status: 400 },
      );
    }

    // .length는 UTF-16 코드 유닛 수라 한글 등 다국어 텍스트에서 실제 바이트 수보다
    // 작게 나온다 — 실제 전송 바이트 수 기준으로 검사해야 캡을 우회할 수 없다.
    if (Buffer.byteLength(JSON.stringify(metadata), "utf8") > MAX_JSON_BYTES) {
      return NextResponse.json(
        { success: false, error: "Metadata too large" },
        { status: 413 },
      );
    }

    const normalizedFileName =
      typeof fileName === "string" && fileName.trim().length > 0
        ? fileName.trim()
        : `metadata-${Date.now()}.json`;

    const uploadResult = await uploadMetadataToPinata(
      metadata,
      normalizedFileName,
    );

    if (
      !uploadResult.success ||
      (!uploadResult.ipfsUrl && !uploadResult.pinataUrl)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: uploadResult.error || "Pinata metadata upload failed",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      ipfsHash: uploadResult.ipfsHash,
      ipfsUrl: uploadResult.ipfsUrl,
      metadataUrl: uploadResult.pinataUrl,
    });
  } catch (error) {
    console.error("❌ NFT 메타데이터 업로드 API 오류:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
