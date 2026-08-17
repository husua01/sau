import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { verifySiwe } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { MAX_SHARED_CONTENT_BYTES } from "@/lib/upload-limits";

// Vercel 함수 요청 바디는 4.5MB로 막혀있어 큰 파일을 직접 받을 수 없다. 대신
// 브라우저가 Vercel Blob에 곧장 업로드하고, 이 라우트는 그 업로드를 허용할지만
// 판단하는 짧은 토큰 발급 역할만 한다(SIWE 서명으로 사용자 인증).

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  if (!rateLimit(`upload-content-blob:${ip}`)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let payload: {
          siweMessage?: string;
          siweSignature?: string;
          userAddress?: string;
        } = {};
        try {
          payload = clientPayload ? JSON.parse(clientPayload) : {};
        } catch {
          throw new Error("Invalid client payload");
        }

        const auth = verifySiwe(
          payload.siweMessage ?? "",
          payload.siweSignature ?? "",
          payload.userAddress ?? "",
        );
        if (!auth.ok) {
          throw new Error(`Unauthorized: ${auth.reason}`);
        }

        // 클라이언트는 원본 파일을 base64/UTF-8 텍스트로 인코딩해 항상
        // text/plain으로 올린다("*/*"는 리터럴 매치라 실제로는 아무것도
        // 허용하지 않아 업로드가 403으로 막혔다).
        return {
          allowedContentTypes: ["text/plain"],
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_SHARED_CONTENT_BYTES,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Upload token generation failed",
      },
      { status: 400 },
    );
  }
}
