/**
 * Pinata IPFS 업로드 라이브러리
 */

export interface PinataUploadResult {
  success: boolean;
  ipfsHash?: string;
  ipfsUrl?: string;
  pinataUrl?: string;
  error?: string;
}

/**
 * 이미지 파일을 Pinata IPFS에 업로드
 */
export async function uploadImageToPinata(file: File): Promise<PinataUploadResult> {
  try {
    console.log(`📤 Pinata IPFS 업로드 시작: ${file.name} (${file.size} bytes)`);

    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecretKey = process.env.PINATA_SECRET_KEY;

    if (!pinataApiKey || !pinataSecretKey) {
      console.warn('⚠️ Pinata API 키가 설정되지 않았습니다.');
      console.log('💡 .env.local에 PINATA_API_KEY와 PINATA_SECRET_KEY를 추가하세요');
      console.log('💡 무료 계정: https://app.pinata.cloud/');
      return {
        success: false,
        error: 'Pinata API keys not configured'
      };
    }

    // FormData 생성
    const formData = new FormData();
    formData.append('file', file);
    
    // Pinata 메타데이터
    const pinataMetadata = {
      name: `nft-image-${Date.now()}-${file.name}`,
      keyvalues: {
        originalName: file.name,
        fileType: file.type,
        fileSize: file.size.toString(),
        uploadedAt: new Date().toISOString(),
        source: 'SAU-Platform'
      }
    };
    
    formData.append('pinataMetadata', JSON.stringify(pinataMetadata));
    
    // Pinata 옵션
    const pinataOptions = {
      cidVersion: 1,
      wrapWithDirectory: false
    };
    
    formData.append('pinataOptions', JSON.stringify(pinataOptions));

    // Pinata API 호출
    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'pinata_api_key': pinataApiKey,
        'pinata_secret_api_key': pinataSecretKey,
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Pinata API 오류: ${response.status} - ${errorData.error?.details || errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const ipfsHash = data.IpfsHash;
    
    // IPFS URL 생성
    const ipfsUrl = `ipfs://${ipfsHash}`;
    const pinataUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
    
    console.log('✅ Pinata IPFS 업로드 성공:', {
      hash: ipfsHash,
      ipfsUrl,
      pinataUrl
    });

    return {
      success: true,
      ipfsHash,
      ipfsUrl,
      pinataUrl
    };

  } catch (error) {
    console.error('❌ Pinata IPFS 업로드 실패:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * JSON 메타데이터를 Pinata IPFS에 업로드
 */
export async function uploadMetadataToPinata(
  metadata: any,
  fileName: string = 'metadata.json'
): Promise<PinataUploadResult> {
  try {
    console.log(`📤 NFT 메타데이터 Pinata 업로드 시작: ${fileName}`);

    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecretKey = process.env.PINATA_SECRET_KEY;

    if (!pinataApiKey || !pinataSecretKey) {
      return {
        success: false,
        error: 'Pinata API keys not configured'
      };
    }

    // JSON을 Blob으로 변환
    const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: 'application/json'
    });

    // FormData 생성
    const formData = new FormData();
    formData.append('file', jsonBlob, fileName);
    
    // Pinata 메타데이터
    const pinataMetadata = {
      name: `nft-metadata-${Date.now()}-${fileName}`,
      keyvalues: {
        contentType: 'application/json',
        uploadType: 'nft-metadata',
        uploadedAt: new Date().toISOString(),
        source: 'SAU-Platform'
      }
    };
    
    formData.append('pinataMetadata', JSON.stringify(pinataMetadata));
    
    // Pinata 옵션
    const pinataOptions = {
      cidVersion: 1,
      wrapWithDirectory: false
    };
    
    formData.append('pinataOptions', JSON.stringify(pinataOptions));

    // Pinata API 호출
    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'pinata_api_key': pinataApiKey,
        'pinata_secret_api_key': pinataSecretKey,
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Pinata API 오류: ${response.status} - ${errorData.error?.details || errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const ipfsHash = data.IpfsHash;
    
    // IPFS URL 생성
    const ipfsUrl = `ipfs://${ipfsHash}`;
    const pinataUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
    
    console.log('✅ NFT 메타데이터 Pinata 업로드 성공:', {
      hash: ipfsHash,
      ipfsUrl,
      pinataUrl
    });

    return {
      success: true,
      ipfsHash,
      ipfsUrl,
      pinataUrl
    };

  } catch (error) {
    console.error('❌ NFT 메타데이터 Pinata 업로드 실패:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Pinata 계정 정보 확인 (API 키 유효성 검증)
 */
export async function verifyPinataConnection(): Promise<boolean> {
  try {
    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecretKey = process.env.PINATA_SECRET_KEY;

    if (!pinataApiKey || !pinataSecretKey) {
      return false;
    }

    const response = await fetch('https://api.pinata.cloud/data/testAuthentication', {
      method: 'GET',
      headers: {
        'pinata_api_key': pinataApiKey,
        'pinata_secret_api_key': pinataSecretKey,
      }
    });

    return response.ok;
  } catch (error) {
    console.error('Pinata 연결 확인 실패:', error);
    return false;
  }
}
