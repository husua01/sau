import { NextRequest, NextResponse } from 'next/server';
import { uploadMetadataToPinata } from '@/lib/pinata';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { metadata, fileName } = body || {};

    if (!metadata || typeof metadata !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing metadata payload'
        },
        { status: 400 }
      );
    }

    const normalizedFileName =
      typeof fileName === 'string' && fileName.trim().length > 0
        ? fileName.trim()
        : `metadata-${Date.now()}.json`;

    const uploadResult = await uploadMetadataToPinata(metadata, normalizedFileName);

    if (!uploadResult.success || (!uploadResult.ipfsUrl && !uploadResult.pinataUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: uploadResult.error || 'Pinata metadata upload failed'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ipfsHash: uploadResult.ipfsHash,
      ipfsUrl: uploadResult.ipfsUrl,
      metadataUrl: uploadResult.pinataUrl
    });
  } catch (error) {
    console.error('❌ NFT 메타데이터 업로드 API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

