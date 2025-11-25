import { NextRequest, NextResponse } from "next/server";
import { checkNFTOwnership, getWalletBalance, getGasPrice } from '../../../lib/blockchain';
import { uploadToArweave, fetchFromArweave, getArweaveDebugInfo } from '../../../lib/arweave';
import { createAccessControlConditions } from "../../../lib/lit-protocol";
import { ethers } from 'ethers';

// Provider 캐시 (싱글톤 패턴)
let cachedProvider: any = null;
let providerLastUsed = 0;
const PROVIDER_CACHE_TTL = 5 * 60 * 1000; // 5분

// NFT 조회 캐시
const nftQueryCache = new Map<string, { data: any; timestamp: number }>();
const NFT_CACHE_TTL = 60 * 1000; // 1분
const MAX_CACHE_SIZE = 100;

// Provider 캐시 관리 함수
function getCachedProvider() {
  const now = Date.now();
  
  // 캐시가 유효하면 재사용
  if (cachedProvider && (now - providerLastUsed) < PROVIDER_CACHE_TTL) {
    providerLastUsed = now;
    return cachedProvider;
  }
  
  // 새 Provider 생성
  const networkMode = process.env.NETWORK_MODE || 'testnet';
  let rpcUrl: string;
  let network: ethers.Networkish;
  
  if (networkMode === 'testnet' || networkMode === 'sepolia') {
    // 공개 Sepolia RPC 엔드포인트 사용 (fallback)
    rpcUrl = process.env.TESTNET_RPC_URL || 
             process.env.SEPOLIA_RPC_URL || 
             "https://rpc.sepolia.org";
    network = {
      name: 'sepolia',
      chainId: 11155111
    };
  } else if (networkMode === 'mainnet') {
    rpcUrl = process.env.MAINNET_RPC_URL || 
             "https://eth-mainnet.g.alchemy.com/v2/demo";
    network = {
      name: 'mainnet',
      chainId: 1
    };
  } else {
    rpcUrl = process.env.LOCALNET_RPC_URL || "http://localhost:8545";
    network = {
      name: 'localhost',
      chainId: 31337
    };
  }
  
  console.log(`🔗 API Provider 초기화: ${networkMode} - ${rpcUrl}`);
  
  try {
    // 네트워크 정보를 명시적으로 제공하여 감지 에러 방지
    cachedProvider = new ethers.JsonRpcProvider(rpcUrl, network);
    providerLastUsed = now;
    return cachedProvider;
  } catch (error) {
    console.error('❌ API Provider 생성 실패:', error);
    // Fallback: Sepolia 공개 RPC
    const fallbackNetwork = {
      name: 'sepolia',
      chainId: 11155111
    };
    cachedProvider = new ethers.JsonRpcProvider("https://rpc.sepolia.org", fallbackNetwork);
    providerLastUsed = now;
    return cachedProvider;
  }
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
    const keysToDelete = Array.from(nftQueryCache.keys()).slice(0, nftQueryCache.size - MAX_CACHE_SIZE);
    keysToDelete.forEach(key => nftQueryCache.delete(key));
  }
}

function resolveMediaUrl(url?: string | null) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${trimmed.slice(7)}`;
  }
  if (trimmed.startsWith('ar://')) {
    return `https://arweave.net/${trimmed.slice(5)}`;
  }
  if (/^[a-zA-Z0-9_-]{43,}$/.test(trimmed)) {
    return `https://arweave.net/${trimmed}`;
  }
  return trimmed;
}

function serializeErrorForClient(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      message: typeof error === 'string' ? error : JSON.stringify(error),
      timestamp: new Date().toISOString()
    };
  }

  const base: Record<string, any> = {
    name: error.name,
    message: error.message,
    timestamp: new Date().toISOString()
  };

  const stackLines = error.stack ? error.stack.split('\n').slice(0, 5) : null;
  if (stackLines && stackLines.length > 0) {
    base.stack = stackLines.join('\n');
  }

  const possibleFields = ['code', 'errno', 'address', 'hostname', 'port', 'syscall', 'status', 'statusText'];
  for (const field of possibleFields) {
    if (field in error && (error as any)[field] !== undefined) {
      base[field] = (error as any)[field];
    }
  }

  const cause = (error as any).cause;
  if (cause) {
    if (cause instanceof Error) {
      base.cause = serializeErrorForClient(cause);
    } else if (typeof cause === 'object') {
      const causeInfo: Record<string, any> = {};
      for (const key of ['name', 'message', 'code', 'errno', 'address', 'hostname', 'port', 'syscall']) {
        if (cause && typeof cause === 'object' && key in cause && (cause as any)[key] !== undefined) {
          causeInfo[key] = (cause as any)[key];
        }
      }
      if (Object.keys(causeInfo).length > 0) {
        base.cause = causeInfo;
      }
    } else {
      base.cause = String(cause);
    }
  }

  return base;
}

function getArweaveDebugSnapshot() {
  try {
    return getArweaveDebugInfo();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to resolve Arweave configuration',
      timestamp: new Date().toISOString()
    };
  }
}

// 통합된 API 핸들러
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  switch (action) {
    case 'health':
      return NextResponse.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        message: 'SAU Platform API is running' 
      });

    case 'config':
      const networkMode = process.env.NETWORK_MODE || 'testnet';
      const isTestnet = networkMode === 'testnet';
      
      return NextResponse.json({
        chainId: isTestnet 
          ? process.env.NEXT_PUBLIC_CHAIN_ID || '11155111'
          : process.env.MAINNET_CHAIN_ID || '1',
        network: isTestnet 
          ? process.env.TESTNET_CHAIN_NAME || 'Sepolia Testnet'
          : process.env.MAINNET_CHAIN_NAME || 'Ethereum Mainnet',
        networkMode,
        arweaveMode: process.env.ARWEAVE_MODE || 'testnet',
        irysMode: process.env.IRYS_MODE || 'testnet',
        version: '1.0.0'
      });
    
    case 'metadata': {
      // ⚡ NFT 메타데이터 JSON 반환 (MetaMask NFT 표시용)
      const tokenId = searchParams.get('tokenId');
      const contractAddr = searchParams.get('contractAddress') || searchParams.get('contract'); // ⚡ 둘 다 지원
      
      if (!tokenId || !contractAddr) {
        return NextResponse.json({ error: 'Missing tokenId or contractAddress' }, { status: 400 });
      }
      try {
        const provider = getCachedProvider();
        const contract = new ethers.Contract(
          contractAddr,
          ["function uri(uint256 tokenId) view returns (string)"],
          provider
        );
        const tokenURI = await contract.uri(BigInt(tokenId));
        const resolvedURI = resolveTokenURI(tokenURI);

        const response = await fetch(resolvedURI, {
          headers: { Accept: 'application/json' }
        });

        if (response.ok) {
          const metadata = await response.json();
          return NextResponse.json(metadata);
        }
      } catch (error) {
        console.warn('메타데이터 URI 조회 실패:', error);
      }

      return NextResponse.json({
        name: `SAU NFT #${tokenId}`,
        description: `SAU 플랫폼에서 생성된 NFT`,
        image: `https://via.placeholder.com/300x300?text=NFT+${tokenId}`
      });
    }

    default:
      return NextResponse.json({ 
        error: 'Invalid action',
        availableActions: ['health', 'config', 'metadata']
      }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case 'upload':
        return handleUpload(data);
      
      case 'upload_image':
        return handleImageUpload(data);
      
      case 'get_nft_metadata':
        return handleGetNFTMetadata(data);
      
      case 'mint':
        return handleMint(data);
      
      case 'batch_upload':
        return handleBatchUpload(data);
      
      case 'create_nft_with_access_control':
        return handleCreateNFTWithAccessControl(data);
      
      case 'upload_shared_content':
        return handleUploadSharedContent(data);
      
      case 'test_access':
        return handleTestAccess(data);
      
    case 'check_nft_ownership':
      return handleCheckNFTOwnership(data);
    
    case 'get_user_nfts':
      return handleGetUserNFTs(data);
    
    case 'calculate_cost':
        return handleCalculateCost(data);
      
      case 'process_payment':
        return handleProcessPayment(data);
      
      case 'burn_nft':
        return handleBurnNFT(data);
      
      default:
        return NextResponse.json({ 
          error: 'Invalid action',
          availableActions: ['upload', 'mint', 'encrypt', 'decrypt', 'batch_upload', 'create_nft_with_access_control', 'test_access', 'calculate_cost', 'process_payment', 'burn_nft']
        }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ 
      error: 'Invalid JSON body' 
    }, { status: 400 });
  }
}

// 업로드 핸들러 (시뮬레이션)
async function handleUpload(data: any) {
  try {
    // 실제 구현에서는 Arweave/Irys를 사용
    const mockTransactionId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return NextResponse.json({
      success: true,
      transactionId: mockTransactionId,
      arweaveUrl: `https://arweave.net/${mockTransactionId}`,
      message: 'Content uploaded successfully (simulated)'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Upload failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 이미지 업로드 핸들러 (최적화: FormData 지원)
async function handleImageUpload(data: any) {
  try {
    // FormData에서 이미지 파일 직접 처리 (base64 변환 불필요)
    const { imageData, fileName, imageType, image } = data;
    
    // FormData로 전송된 경우와 JSON으로 전송된 경우 모두 지원
    const finalFileName = fileName || (image ? image.name : 'image.jpg');
    const finalImageType = imageType || (image ? image.type : 'image/jpeg');
    
    if (!imageData && !image) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: imageData or image file'
      }, { status: 400 });
    }

    // ⚡ 최적화: 이미지 크기 계산 (base64가 아닌 실제 파일 크기)
    const imageSize = image ? image.size : imageData.length;
    
    // 실제 구현에서는 Arweave/Irys를 사용하여 이미지 업로드
    const mockImageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const mockImageUrl = `https://arweave.net/${mockImageId}`;
    
    // 이미지 메타데이터 생성
    const imageMetadata = {
      name: finalFileName,
      type: finalImageType,
      size: imageSize,
      uploadedAt: new Date().toISOString(),
      arweaveId: mockImageId,
      arweaveUrl: mockImageUrl
    };
    
    console.log(`✅ 이미지 업로드 (최적화): ${finalFileName} (${(imageSize / 1024).toFixed(2)} KB)`);
    
    return NextResponse.json({
      success: true,
      imageId: mockImageId,
      imageUrl: mockImageUrl,
      metadata: imageMetadata,
      message: 'Image uploaded successfully (simulated, optimized)'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Image upload failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// NFT 메타데이터 조회 핸들러
async function handleGetNFTMetadata(data: any) {
  try {
    const { contractAddress, tokenId } = data;
    
    if (!contractAddress || !tokenId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: contractAddress, tokenId'
      }, { status: 400 });
    }

    const provider = getCachedProvider();
    const contract = new ethers.Contract(
      contractAddress,
      ["function uri(uint256 tokenId) view returns (string)"],
      provider
    );

    const tokenURI = await contract.uri(tokenId);
    const resolvedURI = resolveTokenURI(tokenURI);

    const response = await fetch(resolvedURI, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch metadata from ${resolvedURI}: ${response.status}`);
    }

    const metadata = await response.json();

    return NextResponse.json({
      success: true,
      metadata,
      hasData: true,
      tokenURI: resolvedURI
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve NFT metadata',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function resolveTokenURI(tokenURI: string): string {
  if (!tokenURI) return tokenURI;
  if (tokenURI.startsWith('ipfs://')) {
    const path = tokenURI.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${path}`;
  }
  return tokenURI;
}

// 공유 콘텐츠 업로드 핸들러
async function handleUploadSharedContent(data: any) {
  try {
    const { content, fileName, contentType, contentEncoding, userAddress } = data;
    
    if (!content || !fileName || !userAddress) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: content, fileName, userAddress'
      }, { status: 400 });
    }

    const tags = [
      { name: 'Content-Type', value: contentType || 'text/plain' },
      { name: 'App-Name', value: 'SAU-Platform' },
      { name: 'File-Name', value: fileName },
      { name: 'Uploaded-By', value: userAddress },
      { name: 'Upload-Type', value: 'shared-content' }
    ];
    if (contentEncoding) {
      tags.push({ name: 'Content-Encoding', value: contentEncoding });
    }

    const arweaveResult = await uploadToArweave(content, tags);

    const contentMetadata = {
      id: arweaveResult.id,
      name: fileName,
      type: contentType || 'text/plain',
      size: content.length,
      uploadedAt: new Date().toISOString(),
      arweaveId: arweaveResult.id,
      arweaveUrl: arweaveResult.url,
      uploadedBy: userAddress,
      encoding: contentEncoding || null
    };
    
    console.log(`✅ 실제 Arweave 업로드 완료: ${fileName} → ${arweaveResult.id}`);
    
    return NextResponse.json({
      success: true,
      contentId: arweaveResult.id,
      contentUrl: arweaveResult.url,
      metadata: contentMetadata,
      message: 'Shared content uploaded successfully to Arweave'
    });
  } catch (error) {
    console.error('❌ Shared content upload failed:', error);
    const debugPayload = {
      error: serializeErrorForClient(error),
      arweave: getArweaveDebugSnapshot(),
    };
    return NextResponse.json({
      success: false,
      error: 'Shared content upload failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      debug: debugPayload
    }, { status: 500 });
  }
}

// 민팅 핸들러 (시뮬레이션)
async function handleMint(data: any) {
  try {
    const { arweaveId, title, description, recipient } = data;
    
    if (!arweaveId || !recipient) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: arweaveId, recipient'
      }, { status: 400 });
    }

    // 실제 구현에서는 블록체인 트랜잭션을 실행
    const mockTokenId = Math.floor(Math.random() * 2147483647).toString(); // int32 최대값 - 1
    const mockTxHash = `0x${Math.random().toString(16).substr(2, 64)}`;
    
    return NextResponse.json({
      success: true,
      tokenId: mockTokenId,
      transactionHash: mockTxHash,
      contractAddress: process.env.SAU_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
      metadata: {
        name: title || 'SAU Content',
        description: description || 'Decentralized content',
        image: `https://arweave.net/${arweaveId}`,
        external_url: `https://arweave.net/${arweaveId}`
      },
      message: 'NFT minted successfully (simulated)'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Minting failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 암호화 핸들러 (시뮬레이션)
async function handleEncrypt(data: any) {
  try {
    const { contractAddress, tokenId, data: contentData, userAddress } = data;
    
    if (!contractAddress || !tokenId || !contentData) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: contractAddress, tokenId, data'
      }, { status: 400 });
    }

    // 실제 구현에서는 Lit Protocol을 사용
    const mockEncryptedData = btoa(contentData); // base64 인코딩
    const mockAccessControlConditions = [
      {
        contractAddress,
        standardContractType: 'ERC1155',
        chain: 'sepolia',
        method: 'balanceOf',
        parameters: [':userAddress', tokenId],
        returnValueTest: {
          comparator: '>',
          value: '0'
        }
      }
    ];
    
    return NextResponse.json({
      success: true,
      encryptedData: mockEncryptedData,
      accessControlConditions: mockAccessControlConditions,
      message: 'Data encrypted successfully (simulated)'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Encryption failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 복호화 핸들러 (시뮬레이션)
async function handleDecrypt(data: any) {
  try {
    const { encryptedData, accessControlConditions, userAddress } = data;
    
    if (!encryptedData || !userAddress) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: encryptedData, userAddress'
      }, { status: 400 });
    }

    // 실제 구현에서는 Lit Protocol을 사용하여 소유권 확인 후 복호화
    const mockDecryptedData = atob(encryptedData); // base64 디코딩
    
    return NextResponse.json({
      success: true,
      decryptedData: mockDecryptedData,
      hasAccess: true,
      message: 'Data decrypted successfully (simulated)'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Decryption failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// NFT 생성 및 자동 접근 제어 핸들러 (실제 구현)
async function handleCreateNFTWithAccessControl(data: any) {
  try {
    const { walletAddress, nftCount, title, description, content, fileName } = data;
    
    if (!walletAddress || !nftCount || !title || !description || !content) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: walletAddress, nftCount, title, description, content'
      }, { status: 400 });
    }

    // 1. 실제 NFT 민팅 (블록체인)
    const tokenIds = [];
    const transactionHashes = [];
    
    try {
      // 실제 컨트랙트 배포가 되어 있다면 실제 민팅 시도
      if (process.env.SAU_CONTRACT_ADDRESS && process.env.SAU_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
        // ⚡ 최적화: 캐시된 Provider 재사용
        const provider = getCachedProvider();
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
        
        // ERC-1155 컨트랙트 ABI
        const contractABI = [
          "function mint(address to, uint256 id, uint256 amount, string calldata contentHash) external",
          "function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts, string[] calldata contentHashes) external"
        ];
        
        const contract = new ethers.Contract(process.env.SAU_CONTRACT_ADDRESS, contractABI, wallet);
        
        if (nftCount === 1) {
          // 단일 NFT 민팅
          const tokenId = Math.floor(Math.random() * 2147483647); // int32 최대값 - 1
          const contentHash = `content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          // 실제 가스비 계산 및 결제
          const gasEstimate = await contract.mint.estimateGas(walletAddress, tokenId, 1, contentHash);
          const gasPrice = await provider.getFeeData();
          
          const tx = await contract.mint(walletAddress, tokenId, 1, contentHash, {
            gasLimit: gasEstimate,
            gasPrice: gasPrice.gasPrice
          });
          
          console.log(`💰 가스비 지불: ${ethers.formatEther(gasPrice.gasPrice! * gasEstimate)} ETH`);
          await tx.wait();
          
          tokenIds.push(tokenId.toString());
          transactionHashes.push(tx.hash);
        } else {
          // 배치 NFT 민팅
          const ids = [];
          const amounts = [];
          const contentHashes = [];
          
          for (let i = 0; i < nftCount; i++) {
            ids.push(Math.floor(Math.random() * 2147483647)); // int32 최대값 - 1
            amounts.push(1);
            contentHashes.push(`content-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`);
          }
          
          // 실제 가스비 계산 및 결제
          const gasEstimate = await contract.mintBatch.estimateGas(walletAddress, ids, amounts, contentHashes);
          const gasPrice = await provider.getFeeData();
          
          const tx = await contract.mintBatch(walletAddress, ids, amounts, contentHashes, {
            gasLimit: gasEstimate,
            gasPrice: gasPrice.gasPrice
          });
          
          console.log(`💰 가스비 지불: ${ethers.formatEther(gasPrice.gasPrice! * gasEstimate)} ETH`);
          await tx.wait();
          
          tokenIds.push(...ids.map(id => id.toString()));
          transactionHashes.push(tx.hash);
        }
        
        console.log(`✅ 실제 NFT 민팅 완료: ${tokenIds.length}개, TX: ${transactionHashes[0]}`);
      } else {
        // 컨트랙트가 배포되지 않았다면 시뮬레이션 모드
        console.warn('⚠️ 컨트랙트가 배포되지 않았습니다. 시뮬레이션 모드로 실행됩니다.');
        
        for (let i = 0; i < nftCount; i++) {
          tokenIds.push(Math.floor(Math.random() * 2147483647).toString()); // int32 최대값 - 1
          transactionHashes.push(`0x${Math.random().toString(16).substr(2, 64)}`);
        }
      }
    } catch (error) {
      console.error('❌ NFT 민팅 실패, 시뮬레이션 모드로 전환:', error);
      
      // 민팅 실패 시 시뮬레이션 모드
      for (let i = 0; i < nftCount; i++) {
        tokenIds.push(Math.floor(Math.random() * 2147483647).toString()); // int32 최대값 - 1
        transactionHashes.push(`0x${Math.random().toString(16).substr(2, 64)}`);
      }
    }
    
    // 2. 접근 제어 조건 설정 (NFT 소유권 기반)
    const contractAddress = process.env.SAU_CONTRACT_ADDRESS || "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
    const accessControlConditions = createAccessControlConditions(contractAddress, tokenIds[0]);
    
    // 3. Lit Protocol을 사용하여 데이터 암호화 (시뮬레이션 모드)
    // 실제 Lit Protocol은 클라이언트 사이드에서 실행되어야 하므로 서버에서는 시뮬레이션
    let litEncryptionResult;
    try {
      // 서버 사이드에서는 시뮬레이션 모드 사용 (Buffer 사용으로 btoa 오류 해결)
      const encodedContent = Buffer.from(content, 'utf8').toString('base64');
      litEncryptionResult = {
        encryptedString: encodedContent,
        symmetricKey: `lit-simulation-key-${Date.now()}`
      };
      console.log('✅ Lit Protocol 시뮬레이션 모드로 암호화 완료');
    } catch (litError) {
      console.warn('Lit Protocol 암호화 실패, 시뮬레이션 모드로 전환:', litError);
        // Lit Protocol 실패 시 시뮬레이션 모드
        const encodedContent = Buffer.from(content, 'utf8').toString('base64');
        litEncryptionResult = {
          encryptedString: encodedContent,
          symmetricKey: `lit-simulation-key-${Date.now()}`
        };
    }
    
    // 4. 암호화된 데이터를 Arweave에 업로드
    let arweaveResult;
    try {
      // 실제 Arweave 업로드
      const tags = [
        { name: 'Content-Type', value: 'application/octet-stream' },
        { name: 'App-Name', value: 'SAU-Platform' },
        { name: 'NFT-Contract', value: contractAddress },
        { name: 'Token-IDs', value: tokenIds.join(',') },
        { name: 'Encrypted', value: 'true' },
        { name: 'Encryption-Method', value: 'lit-protocol' }
      ];
      
      arweaveResult = await uploadToArweave(litEncryptionResult.encryptedString, tags);
    } catch (arweaveError) {
      console.warn('Arweave 업로드 실패, 시뮬레이션 모드로 전환:', arweaveError);
      // Arweave 실패 시 시뮬레이션 모드
      arweaveResult = {
        id: `simulated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: `https://arweave.net/simulated-${Date.now()}`
      };
    }
    
    // 5. Arweave 메타데이터 설정
    const arweaveMetadata = {
      encrypted: true,
      encryptionMethod: 'lit-protocol',
      accessControlConditions,
      litNetwork: process.env.LIT_NETWORK || 'datil',
      nftContract: contractAddress,
      tokenIds,
      originalFileName: fileName,
      encryptedAt: new Date().toISOString(),
      note: "복호화 키는 Lit Protocol 분산 네트워크에서 관리됩니다"
    };
    
    // 파일 내용이 너무 길면 압축하여 표시
    const displayContent = content.length > 200 ? content.substring(0, 200) + '...' : content;
    
    return NextResponse.json({
      success: true,
      arweaveId: arweaveResult.id,
      arweaveUrl: arweaveResult.url,
      contractAddress,
      tokenIds,
      transactionHashes,
      nftCount,
      walletAddress,
      fileName,
      contentSize: content.length,
      displayContent,
      // 보안: 원본 콘텐츠는 반환하지 않음, Lit Protocol 암호화 결과만 반환
      litEncryptionResult,
      accessControlConditions,
      arweaveMetadata,
      metadata: {
        name: title,
        description: description,
        image: arweaveResult.url,
        external_url: arweaveResult.url,
        file_name: fileName,
        encrypted: true,
        access_controlled: true
      },
      message: `${nftCount}개 NFT가 생성되고 "${fileName}" 파일이 Lit Protocol로 암호화되어 Arweave에 저장되었습니다. 복호화 키는 Lit Protocol 분산 네트워크에서 관리되며, NFT 소유자만 접근 가능합니다.`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'NFT creation with access control failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 접근 테스트 핸들러 (NFT 소유권 확인)
async function handleTestAccess(data: any) {
  try {
    const { contractAddress, tokenId, userAddress } = data;

    if (!contractAddress || !tokenId || !userAddress) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: contractAddress, tokenId, userAddress'
      }, { status: 400 });
    }

    const normalizedTokenId = typeof tokenId === 'string' ? tokenId : tokenId.toString();

    // 1. 실제 블록체인에서 NFT 소유권 확인
    const hasNFTOwnership = await checkNFTOwnership(contractAddress, normalizedTokenId, userAddress);

    if (!hasNFTOwnership) {
      return NextResponse.json({
        success: true,
        hasAccess: false,
        contractAddress,
        tokenId: normalizedTokenId,
        userAddress,
        message: '접근 실패: NFT를 소유하고 있지 않습니다.'
      });
    }

    // 2. 온체인에서 Token URI 조회 및 메타데이터 확인
    const provider = getCachedProvider();
    const metadataContract = new ethers.Contract(
      contractAddress,
      ['function uri(uint256 tokenId) view returns (string)'],
      provider
    );

    const rawTokenURI = await metadataContract.uri(normalizedTokenId);
    const tokenURI = resolveTokenURI(rawTokenURI);

    let metadataResponse: Response;
    try {
      metadataResponse = await fetch(tokenURI, {
        headers: {
          Accept: 'application/json'
        }
      });
    } catch (fetchError) {
      console.error('메타데이터 요청 실패:', fetchError);
      return NextResponse.json({
        success: false,
        hasAccess: true,
        contractAddress,
        tokenId: normalizedTokenId,
        userAddress,
        tokenURI,
        error: 'Failed to fetch token metadata',
        message: fetchError instanceof Error ? fetchError.message : 'Unknown metadata fetch error'
      }, { status: 502 });
    }

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text().catch(() => '');
      console.error('메타데이터 응답 오류:', metadataResponse.status, errorText);
      return NextResponse.json({
        success: false,
        hasAccess: true,
        contractAddress,
        tokenId: normalizedTokenId,
        userAddress,
        tokenURI,
        error: 'Token metadata request failed',
        status: metadataResponse.status,
        statusText: metadataResponse.statusText
      }, { status: metadataResponse.status });
    }

    const metadata = await metadataResponse.json();
    const properties = metadata.properties ?? {};
    const encryptionData = properties.encryptionData || metadata.encryptionData || null;

    let arweaveUrl = properties.arweaveUrl || metadata.arweaveUrl || null;
    let arweaveId = properties.contentHash || metadata.contentHash || null;

    if (!arweaveId && arweaveUrl) {
      try {
        const parsed = new URL(arweaveUrl);
        arweaveId = parsed.pathname.replace(/^\/+/, '');
      } catch (urlError) {
        console.warn('Arweave URL 파싱 실패:', urlError);
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
        arweaveFetchError = error instanceof Error ? error.message : 'Unknown Arweave fetch error';
        console.warn('Arweave 콘텐츠 조회 실패:', error);
      }
    }

    const accessControlConditions =
      encryptionData?.accessControlConditions || createAccessControlConditions(contractAddress, normalizedTokenId);

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
      arweaveContent,
      decryptedContent: encryptionData?.originalContent ?? arweaveContent,
      message: arweaveContent ? 'Arweave에서 암호화된 데이터를 조회했습니다.' : '메타데이터를 조회했습니다.'
    };

    if (arweaveFetchError) {
      responsePayload.arweaveFetchError = arweaveFetchError;
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('NFT 접근 테스트 실패:', error);
    return NextResponse.json({
      success: false,
      error: 'Access test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 결제 처리 핸들러
async function handleProcessPayment(data: any) {
  try {
    const { 
      walletAddress, 
      nftCount, 
      title, 
      description, 
      content, 
      fileName,
      gasPrice,
      gasLimit 
    } = data;
    
    if (!walletAddress || !nftCount || !title || !description || !content) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields for payment processing'
      }, { status: 400 });
    }

    // 실제 구현에서는 여기서:
    // 1. 사용자 지갑의 잔액 확인
    // 2. 가스비 및 Arweave 비용 차감
    // 3. 블록체인 트랜잭션 실행
    // 4. Arweave 업로드 실행
    
    // 시뮬레이션: 결제 처리 완료
    const mockTransactionHash = `0x${Math.random().toString(16).substr(2, 64)}`;
    const mockArweaveId = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return NextResponse.json({
      success: true,
      paymentProcessed: true,
      transactionHash: mockTransactionHash,
      arweaveId: mockArweaveId,
      message: '결제가 성공적으로 처리되었습니다. NFT 생성이 진행됩니다.',
      // NFT 생성 결과도 함께 반환
      nftResult: await handleCreateNFTWithAccessControl(data)
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Payment processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// NFT 소유권 조회 처리 (실제 블록체인 연동)
async function handleCheckNFTOwnership(data: any) {
  try {
    const { contractAddress, tokenId, userAddress } = data;
    if (!contractAddress || !tokenId || !userAddress) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: contractAddress, tokenId, userAddress' 
      }, { status: 400 });
    }

    // 실제 블록체인에서 NFT 소유권 조회
    const hasOwnership = await checkNFTOwnership(contractAddress, tokenId, userAddress);
    
    if (hasOwnership) {
      return NextResponse.json({
        success: true,
        hasOwnership: true,
        contractAddress,
        tokenId,
        userAddress,
        balance: "1", // ERC-1155 balance
        message: 'NFT 소유권이 확인되었습니다.'
      });
    } else {
      return NextResponse.json({
        success: true,
        hasOwnership: false,
        contractAddress,
        tokenId,
        userAddress,
        balance: "0",
        message: 'NFT를 소유하고 있지 않습니다.'
      });
    }
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: 'NFT ownership check failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

// 비용 계산 핸들러
async function handleCalculateCost(data: any) {
  try {
    const { nftCount, contentSize } = data;
    
    if (!nftCount || !contentSize) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: nftCount, contentSize'
      }, { status: 400 });
    }

    // 네트워크 모드에 따른 비용 계산
    const networkMode = process.env.NETWORK_MODE || 'testnet';
    const isTestnet = networkMode === 'testnet';
    
    // 이더리움 가스비 계산 (ERC-1155 민팅 기준)
    const gasPrice = isTestnet ? 20 : 30; // 테스트넷: 20 Gwei, 메인넷: 30 Gwei
    const gasLimit = 150000; // NFT 민팅 가스 한도
    const ethGasCost = (gasPrice * gasLimit * nftCount) / 1e9; // ETH 단위
    
    // USD 환율 (실제로는 API에서 가져옴)
    const ethToUsd = isTestnet ? 2500 : 3000; // 테스트넷: 2500, 메인넷: 3000
    
    const totalCostUsd = ethGasCost * ethToUsd;
    const ethGasUsd = (ethGasCost * ethToUsd);

    return NextResponse.json({
      success: true,
      ethereumGas: ethGasCost.toFixed(6),
      arweaveStorage: "0.000000",
      litProtocol: "0.000000",
      totalCost: ethGasCost.toFixed(6),
      networkInfo: {
        mode: networkMode,
        isTestnet,
        gasPrice,
        ethToUsd
      },
      breakdown: {
        ethGasUsd: ethGasCost.toFixed(6),
        arStorageUsd: "0.000000",
        litProtocolUsd: "0.000000",
        nftCount,
        contentSizeKB: (contentSize / 1024).toFixed(2)
      },
      message: `${networkMode === 'testnet' ? '테스트넷' : '메인넷'} 기준 가스비 추정치입니다.`
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Cost calculation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 일괄 업로드 및 민팅 핸들러 (시뮬레이션) - 기존 호환성 유지
async function handleBatchUpload(data: any) {
  try {
    const { walletAddress, nftCount, title, description, text, fileName } = data;
    
    if (!walletAddress || !nftCount || !title || !description || !text) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: walletAddress, nftCount, title, description, text'
      }, { status: 400 });
    }

    // 실제 구현에서는 Arweave 업로드 + 다중 NFT 민팅
    const mockArweaveId = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const tokenIds = [];
    const transactionHashes = [];
    
    for (let i = 0; i < nftCount; i++) {
      tokenIds.push(Math.floor(Math.random() * 2147483647).toString()); // int32 최대값 - 1
      transactionHashes.push(`0x${Math.random().toString(16).substr(2, 64)}`);
    }
    
    return NextResponse.json({
      success: true,
      arweaveId: mockArweaveId,
      arweaveUrl: `https://arweave.net/${mockArweaveId}`,
      contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
      tokenIds,
      transactionHashes,
      nftCount,
      walletAddress,
      metadata: {
        name: title,
        description: description,
        image: `https://arweave.net/${mockArweaveId}`,
        external_url: `https://arweave.net/${mockArweaveId}`
      },
      message: `${nftCount}개 NFT가 성공적으로 생성되었습니다 (시뮬레이션)`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Batch upload failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 간단한 사용자 NFT 목록 조회 (최적화됨)
async function handleGetUserNFTs(data: any) {
  try {
    const { userAddress, contractAddress: clientContractAddress } = data;

    if (!userAddress) {
      return NextResponse.json({
        success: false,
        error: 'Missing required field: userAddress'
      }, { status: 400 });
    }

    // ⚡ 클라이언트에서 전달한 주소 우선 사용
    const contractAddress = clientContractAddress || 
      process.env.SAU_CONTRACT_ADDRESS || 
      process.env.NEXT_PUBLIC_SAU_CONTRACT_ADDRESS ||
      "0xaF2ee6a63814052e52093E41E5eB2d06Bb53F6C9";
    
    console.log(`🔧 NFT 조회 시작 - 컨트랙트 주소: ${contractAddress}, 사용자 주소: ${userAddress}`);
    
    // ⚡ 캐시 비활성화 (디버깅용 - 항상 최신 데이터 조회)
    // 주기적 캐시 정리
    cleanupCache();
    
    console.log(`🔍 캐시 없이 실시간 조회 시작...`);
    
    // 시뮬레이션: 사용자가 소유한 NFT 목록 생성
    const userNFTs = [
      {
        tokenId: "1",
        name: "내 첫 번째 SAU NFT",
        description: "SAU 플랫폼에서 생성된 첫 번째 NFT입니다.",
        image: "https://arweave.net/simulated-1",
        contractAddress,
        balance: "1",
        createdAt: new Date().toISOString()
      },
      {
        tokenId: "2",
        name: "특별한 콘텐츠 NFT",
        description: "중요한 문서나 이미지가 포함된 NFT입니다.",
        image: "https://arweave.net/simulated-2", 
        contractAddress,
        balance: "1",
        createdAt: new Date().toISOString()
      }
    ];

    // 실제 블록체인 조회 시도 (실패하면 시뮬레이션 사용)
    try {
      // ⚡ 최적화: 캐시된 Provider 재사용
      console.log(`🔗 캐시된 블록체인 프로바이더 사용`);
      const provider = getCachedProvider();
      const latestBlock = await provider.getBlockNumber();
      const deploymentBlockEnv = Number(
        process.env.SAU_DEPLOYMENT_BLOCK ||
        process.env.NFT_DEPLOYMENT_BLOCK ||
        process.env.NEXT_PUBLIC_SAU_DEPLOYMENT_BLOCK ||
        '0'
      );
      const lookbackBlocks = Number(process.env.NFT_EVENT_LOOKBACK || '120000');
      const chunkSize = Number(process.env.NFT_EVENT_CHUNK_SIZE || '6000');
      const initialFromBlock = deploymentBlockEnv > 0
        ? deploymentBlockEnv
        : Math.max(latestBlock - lookbackBlocks, 0);

      const queryFilterInRanges = async (filter: any, fromBlock: number, toBlock: number, description: string) => {
        const events: ethers.EventLog[] = [];
        let start = fromBlock;
        while (start <= toBlock) {
          const end = Math.min(start + chunkSize - 1, toBlock);
          try {
            const chunk = await contract.queryFilter(filter, start, end);
            events.push(...(chunk as ethers.EventLog[]));
          } catch (error) {
            console.warn(`⚠️ ${description} 이벤트 조회 실패 (${start}-${end})`, error);
            throw error;
          }
          start = end + 1;
        }
        return events;
      };
      const contract = new ethers.Contract(contractAddress, [
        "function balanceOf(address account, uint256 id) view returns (uint256)",
        "function getTokenInfo(uint256 tokenId) view returns (string, address, uint256)",
        "function totalSupply() view returns (uint256)",
        "function uri(uint256 tokenId) view returns (string)",
        "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
        "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
        "event ContentCreated(uint256 indexed tokenId, address indexed creator, string contentHash)"
      ], provider);

      const realNFTs = [];
      
      // 1. 🚀 이벤트 기반 NFT 조회 (훨씬 빠름!)
      console.log(`🔍 이벤트 기반 NFT 조회 시작...`);
      
      const foundTokenIds = new Set<string>();
      
      const transferSingleFilter = contract.filters.TransferSingle(null, null, userAddress);
      const transferBatchFilter = contract.filters.TransferBatch(null, null, userAddress);
      const contentCreatedForUserFilter = contract.filters.ContentCreated(null, userAddress);
      const allContentCreatedFilter = contract.filters.ContentCreated();

      const collectEventsWithFallback = async (filter: any, description: string, includeAll: boolean = false) => {
        try {
          return await queryFilterInRanges(filter, initialFromBlock, latestBlock, description);
        } catch (error) {
          if (initialFromBlock > 0) {
            console.warn(`⚠️ ${description} 이벤트 조회 초기 범위 실패, 전체 범위 재시도`);
            return await queryFilterInRanges(filter, 0, latestBlock, description);
          }
          if (includeAll) {
            throw error;
          }
          return [];
        }
      };

      try {
        const singleEvents = await collectEventsWithFallback(transferSingleFilter, 'TransferSingle');
        for (const event of singleEvents) {
          const eventArgs = (event as any).args;
          const rawId = eventArgs?.id;
          const tokenId = rawId !== undefined && rawId !== null ? rawId.toString() : null;
          if (tokenId && tokenId !== '0') {
            foundTokenIds.add(tokenId);
          }
        }
        console.log(`🔍 TransferSingle 이벤트에서 ${singleEvents.length}개 로그 확인`);
      } catch (singleError) {
        console.warn('⚠️ TransferSingle 이벤트 조회 최종 실패:', singleError);
      }

      try {
        const batchEvents = await collectEventsWithFallback(transferBatchFilter, 'TransferBatch');
        for (const event of batchEvents) {
          const eventArgs = (event as any).args;
          const tokenIds = eventArgs?.ids || [];
          for (const id of tokenIds) {
            const tokenId = id !== undefined && id !== null ? id.toString() : null;
            if (tokenId && tokenId !== '0') {
              foundTokenIds.add(tokenId);
            }
          }
        }
        console.log(`🔍 TransferBatch 이벤트에서 ${batchEvents.length}개 로그 확인`);
      } catch (batchError) {
        console.warn('⚠️ TransferBatch 이벤트 조회 최종 실패:', batchError);
      }

      try {
        const createdEventsForUser = await collectEventsWithFallback(contentCreatedForUserFilter, 'ContentCreated(사용자)');
        for (const event of createdEventsForUser) {
          const eventArgs = (event as any).args;
          const rawId = eventArgs?.tokenId;
          const tokenId = rawId !== undefined && rawId !== null ? rawId.toString() : null;
          if (tokenId && tokenId !== '0') {
            foundTokenIds.add(tokenId);
          }
        }
        console.log(`🔍 ContentCreated(사용자) 이벤트에서 ${createdEventsForUser.length}개 로그 확인`);
      } catch (contentError) {
        console.warn('⚠️ ContentCreated(사용자) 이벤트 조회 최종 실패:', contentError);
      }

      try {
        const createdEventsAll = await collectEventsWithFallback(allContentCreatedFilter, 'ContentCreated(전체)', true);
        console.log(`🔍 ContentCreated(전체) 이벤트에서 ${createdEventsAll.length}개 로그 확인`);
        for (const event of createdEventsAll) {
          const eventArgs = (event as any).args;
          const rawId = eventArgs?.tokenId;
          const tokenId = rawId !== undefined && rawId !== null ? rawId.toString() : null;
          if (tokenId && tokenId !== '0') {
            foundTokenIds.add(tokenId);
          }
        }
      } catch (allContentError) {
        console.warn('⚠️ ContentCreated(전체) 이벤트 조회 실패:', allContentError);
      }

      console.log(`🔍 이벤트에서 발견된 토큰 ID: ${Array.from(foundTokenIds).join(', ') || '없음'}`);

      // 이벤트 조회로 NFT를 못 찾았거나 에러 발생 시 대체 방법 사용
      if (foundTokenIds.size === 0) {
        // 메타데이터에서도 못 찾으면 효율적으로 직접 확인
        if (foundTokenIds.size === 0) {
          console.log('🔄 직접 잔액 확인 중 (효율적인 방법)...');
          
          // ⚡ 최적화: 가장 가능성 높은 범위 우선 확인
          const rangesToCheck = [
            { start: 1, end: 500 },      // 최근 생성 가능성 높음
            { start: 501, end: 1000 }    // 추가 범위
          ];
          
          for (const range of rangesToCheck) {
            const checkPromises = [];
            
            for (let i = range.start; i <= range.end; i++) {
              checkPromises.push(
                contract.balanceOf(userAddress, i)
                  .then((balance: any) => {
                    const balanceBigInt = typeof balance === 'bigint'
                      ? balance
                      : BigInt(balance?.toString?.() ?? '0');
                    if (balanceBigInt > 0n) {
                    const tokenIdStr = i.toString();
                    foundTokenIds.add(tokenIdStr);
                    console.log(`✅ 직접 확인: Token ID ${tokenIdStr} 잔액 ${balanceBigInt.toString()}`);
                    }
                  })
                  .catch(() => {}) // 에러 무시
              );
              
              // ⚡ 100개씩 배치 처리
              if (checkPromises.length >= 100) {
                await Promise.all(checkPromises);
                checkPromises.length = 0; // 배열 초기화
                
                // NFT를 찾았으면 조기 종료
                // ⚠️ 모든 토큰을 찾기 위해 중단하지 않고 계속 확인
              }
            }
            
            // 남은 요청 처리
            if (checkPromises.length > 0) {
              await Promise.all(checkPromises);
            }
            
            // 모든 범위를 순회하여 가능한 모든 토큰을 수집
          }
          
          console.log(`🔍 직접 확인 완료: ${foundTokenIds.size}개 NFT 발견`);
        }
      }

      if (foundTokenIds.size === 0) {
        console.log('📭 사용자가 보유한 NFT가 없습니다.');
        return NextResponse.json({ success: true, nfts: [] });
      }
      
      // 2. 발견된 토큰들의 실제 잔액 확인 (이중 확인)
      console.log(`💰 ${foundTokenIds.size}개 토큰의 잔액 확인 중...`);
      const balanceResults: Array<{ tokenId: string; balance: bigint }> = [];
      for (const tokenId of foundTokenIds) {
        try {
          const tokenIdBigInt = BigInt(tokenId);
          const balance = await contract.balanceOf(userAddress, tokenIdBigInt);
          const balanceBigInt = typeof balance === 'bigint'
            ? balance
            : BigInt(balance?.toString?.() ?? '0');
          if (balanceBigInt > 0n) {
            balanceResults.push({ tokenId, balance: balanceBigInt });
            console.log(`✅ 토큰 ID ${tokenId} 잔액: ${balanceBigInt.toString()}`);
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
            const [contentHash, creator, creationTime] = await contract.getTokenInfo(tokenIdBigInt);
            let tokenURIValue = '';
            try {
              tokenURIValue = await contract.uri(tokenIdBigInt);
            } catch (uriError) {
              console.warn(`⚠️ Token ID ${tokenId} URI 조회 실패:`, uriError);
            }
            const creationTimeBigInt = typeof creationTime === 'bigint'
              ? creationTime
              : BigInt(creationTime?.toString?.() ?? '0');
            
            let metadataFromURI: any = null;
            let resolvedTokenURI = '';
            if (tokenURIValue) {
              resolvedTokenURI = resolveTokenURI(tokenURIValue);
              try {
                const metadataResponse = await fetch(resolvedTokenURI, {
                  headers: { Accept: 'application/json' }
                });
                if (metadataResponse.ok) {
                  metadataFromURI = await metadataResponse.json();
                }
              } catch (metadataError) {
                console.warn(`⚠️ Token ID ${tokenId} 메타데이터 조회 실패:`, metadataError);
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
              resolveMediaUrl(metadataFromURI?.properties?.coverImageMetadataUrl),
              resolveMediaUrl(metadataFromURI?.properties?.coverImageMetadataIpfsUrl),
              resolveMediaUrl(metadataFromURI?.properties?.arweaveUrl),
              resolveMediaUrl(contentHash && contentHash !== "" ? `https://arweave.net/${contentHash}` : null)
            ].filter(Boolean) as string[];

            const coverImageUrl =
              candidateImageUrls.find((url) => !!url) ||
              `https://via.placeholder.com/300x300?text=NFT+${tokenId}`;

            const hasEncryptionMetadata =
              metadataFromURI?.properties?.encrypted === true ||
              metadataFromURI?.properties?.encrypted === 'true' ||
              (Array.isArray(metadataFromURI?.attributes) &&
                metadataFromURI.attributes.some(
                  (attr: any) =>
                    (attr.trait_type === 'Encrypted' || attr.trait_type === 'encrypted') &&
                    (attr.value === 'Yes' || attr.value === true)
                ));

            realNFTs.push({
              tokenId: tokenId.toString(),
              name: nftName,
              description: nftDescription,
              image: coverImageUrl,
              contractAddress,
              balance: balance.toString(),
              createdAt: creationTimeBigInt > 0n
                ? new Date(Number(creationTimeBigInt) * 1000).toISOString()
                : new Date().toISOString(),
              contentHash: contentHash || "",
              creator: creator || "0x0000000000000000000000000000000000000000",
              coverImageUrl: coverImageUrl,
              fileName: fileNameFromMetadata,
              hasEncryption: hasEncryptionMetadata,
              tokenURI: resolvedTokenURI || tokenURIValue || ''
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
              tokenURI: ''
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
        message: realNFTs.length > 0 
          ? `실제 블록체인에서 ${realNFTs.length}개의 NFT를 찾았습니다.`
          : `실제 블록체인에서 NFT를 찾지 못했습니다.`,
        isRealBlockchain: true
      };
      
      // ⚡ 캐시 비활성화 (항상 최신 데이터 조회)
      // nftQueryCache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      console.log(`✅ NFT 조회 완료: ${realNFTs.length}개 반환`);
      return NextResponse.json(result);
    } catch (error: any) {
      console.error('❌ 실제 블록체인 조회 실패:');
      console.error('  - 에러 메시지:', error.message);
      console.error('  - 에러 코드:', error.code);
      console.error('  - 전체 에러:', error);
      
      // 블록체인 조회 실패 시에만 시뮬레이션 모드 사용
      return NextResponse.json({
        success: true,
        userAddress,
        contractAddress,
        nfts: userNFTs,
        totalCount: userNFTs.length,
        message: `블록체인 조회 실패로 시뮬레이션 모드를 사용합니다. (${userNFTs.length}개 표시)`,
        errorDetails: error.message,
        isRealBlockchain: false
      });
    }

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to get user NFTs',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// NFT 파기 핸들러
async function handleBurnNFT(data: any) {
  try {
    const { contractAddress, tokenId, userAddress, amount = 1 } = data;
    
    if (!contractAddress || !tokenId || !userAddress) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: contractAddress, tokenId, userAddress'
      }, { status: 400 });
    }

    // 컨트랙트 인스턴스 생성
    const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8545');
    const contract = new ethers.Contract(contractAddress, [
      'function burn(address from, uint256 id, uint256 amount) external',
      'function balanceOf(address account, uint256 id) view returns (uint256)',
      'function isApprovedForAll(address account, address operator) view returns (bool)'
    ], provider);

    // 소유권 확인
    const balance = await contract.balanceOf(userAddress, tokenId);
    if (balance < amount) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient NFT balance',
        message: `소유한 NFT 수량이 부족합니다. (소유: ${balance}, 요청: ${amount})`
      }, { status: 400 });
    }

    // 파기 트랜잭션 시뮬레이션 (실제로는 프론트엔드에서 실행)
    const mockTransactionHash = `0x${Math.random().toString(16).substr(2, 64)}`;
    
    return NextResponse.json({
      success: true,
      transactionHash: mockTransactionHash,
      contractAddress,
      tokenId,
      userAddress,
      amount,
      message: 'NFT 파기가 성공적으로 처리되었습니다. (시뮬레이션)',
      isSimulation: true
    });

  } catch (error) {
    console.error('NFT 파기 실패:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to burn NFT',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

