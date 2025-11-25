"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ethers } from 'ethers';
import { processTextAsFile, encryptFile } from '@/lib/file-encryption';
import { initLitClient, encryptWithLit, createAccessControlConditions } from '@/lib/lit-protocol';
import { keccak256, toUtf8Bytes } from 'ethers';

function generateTokenId(address: string, index: number) {
 const normalizedAddress = address?.toLowerCase() || '0x';
 const randomValues = new Uint32Array(2);
 if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
 crypto.getRandomValues(randomValues);
 } else {
 randomValues[0] = Math.floor(Math.random() * 0xffffffff);
 randomValues[1] = Math.floor(Math.random() * 0xffffffff);
 }
 const entropy = `${normalizedAddress}-${Date.now()}-${index}-${randomValues[0]}-${randomValues[1]}-${Math.random()}`;
 const hash = keccak256(toUtf8Bytes(entropy));
 return BigInt(hash).toString();
}
export default function CreateNFTPage() {
 const [result, setResult] = useState<any>(null);
 const [loading, setLoading] = useState(false);
 const [costEstimate, setCostEstimate] = useState<any>(null);
 const [showCostBreakdown, setShowCostBreakdown] = useState(false);
 const [walletConnected, setWalletConnected] = useState(false);
 const [walletAddress, setWalletAddress] = useState<string>('');
 const [walletState, setWalletState] = useState({
 isConnected: false,
 address: '',
 chainId: '',
 balance: ''
 });
 // Sepolia 테스트넷 컨트랙트 주소
 const [contractAddress] = useState(
 process.env.NEXT_PUBLIC_SAU_CONTRACT_ADDRESS ||
 process.env.SAU_CONTRACT_ADDRESS ||
 '0x64cAf3Bd2F96304Ee8Dc3D46Ea816B2e5bfbB902'
 );
 const [paymentStep, setPaymentStep] = useState<'estimate' | 'payment' | 'processing'>('estimate');
 const [nftAmount, setNftAmount] = useState<number>(1);
 const [inputMode, setInputMode] = useState<'text' | 'file' | 'image' | null>(null);
 const [coverImage, setCoverImage] = useState<File | null>(null);
 const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
 const [imageLoading, setImageLoading] = useState(false);
 const [minting, setMinting] = useState(false);
 const coverImageInputRef = useRef<HTMLInputElement | null>(null);

 const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
 let binary = '';
 const bytes = new Uint8Array(buffer);
 const chunkSize = 0x8000;
 for (let i = 0; i < bytes.length; i += chunkSize) {
 const chunk = bytes.subarray(i, i + chunkSize);
 binary += String.fromCharCode(...chunk);
 }
 return btoa(binary);
 };

 // 이미지 업로드 핸들러
 const handleImageUpload = (event: any) => {
 const file = event.target?.files?.[0];
 if (!file) return;

 // 빠른 검증
 if (!file.type.startsWith('image/')) {
 alert('이미지 파일만 업로드 가능합니다.');
 return;
 }
 
 if (file.size > 10 * 1024 * 1024) {
 alert('이미지 크기는 10MB 이하여야 합니다.');
 return;
 }
 
 // 즉시 로딩 상태로 변경 (사용자 피드백)
 setImageLoading(true);
 
 try {
 if (coverImagePreview) {
  URL.revokeObjectURL(coverImagePreview);
 }

 const previewUrl = URL.createObjectURL(file);
 setCoverImage(file);
 setCoverImagePreview(previewUrl);
 } catch (error) {
 console.error('이미지 처리 실패:', error);
 alert('이미지 처리 중 오류가 발생했습니다.');
 } finally {
 setImageLoading(false);
 }
 };

 // 이미지 제거 핸들러
 const handleImageRemove = () => {
 // 메모리 누수 방지: Object URL 정리
 if (coverImagePreview) {
 URL.revokeObjectURL(coverImagePreview);
 }
 setCoverImage(null);
 setCoverImagePreview(null);
 
 // input 초기화
 if (coverImageInputRef.current) {
 coverImageInputRef.current.value = '';
 }
 };

 // 컴포넌트 언마운트 시 URL 정리
 useEffect(() => {
 return () => {
 if (coverImagePreview) {
  URL.revokeObjectURL(coverImagePreview);
 }
 };
 }, [coverImagePreview]);

 // MetaMask 연결 함수 (test 페이지와 동일)
 const connectWallet = async () => {
 if (typeof window !== 'undefined' && (window as any).ethereum) {
 try {
  setLoading(true);
  
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  
  if (accounts.length > 0) {
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();
  const balance = await provider.getBalance(address);
  
  setWalletState({
  isConnected: true,
  address: address,
  chainId: network.chainId.toString(),
  balance: ethers.formatEther(balance)
  });
  
  setWalletAddress(address);
  setWalletConnected(true);
  setPaymentStep('payment');
  
  // 네트워크 확인 - Sepolia 테스트넷
  const expectedChainId = 11155111n; // Sepolia 테스트넷
  
  if (network.chainId !== expectedChainId) {
  alert(`Sepolia 테스트넷(Chain ID: 11155111)으로 전환해주세요.\n\n현재 네트워크: Chain ID ${network.chainId.toString()}`);
  }
  }
 } catch (error) {
  console.error('MetaMask 연결 실패:', error);
  alert('MetaMask 연결에 실패했습니다.');
 } finally {
  setLoading(false);
 }
 } else {
 alert('MetaMask가 설치되어 있지 않습니다. MetaMask를 설치해주세요.');
 }
 };

 // SAU 컨트랙트 ABI (필수 함수들만)
 const SAU_ABI = [
 "function mint(address to, uint256 id, uint256 amount, string memory contentHash) external",
 "function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts, string[] calldata contentHashes) external",
 "function mintWithMetadata(address to, uint256 id, uint256 amount, string calldata contentHash, string calldata tokenURI) external",
 "function mintBatchWithMetadata(address to, uint256[] calldata ids, uint256[] calldata amounts, string[] calldata contentHashes, string[] calldata tokenURIs) external",
 "function balanceOf(address account, uint256 id) view returns (uint256)",
 "function getTokenInfo(uint256 tokenId) view returns (string memory, address, uint256)",
 "function supportsInterface(bytes4 interfaceId) view returns (bool)",
 "function setTokenURI(uint256 tokenId, string calldata tokenURI) external", // MetaMask NFT 표시용
 "function uri(uint256 tokenId) view returns (string memory)", // Token URI 조회
 "function MINTER_ROLE() view returns (bytes32)", // 권한 확인용
 "function hasRole(bytes32 role, address account) view returns (bool)", // 권한 확인용
 "function grantRole(bytes32 role, address account) external" // 권한 부여
 ];

 // NFT 민팅 함수 (여러 개 생성 지원)
 const mintNFT = async (formData: FormData) => {
 if (!walletState.address || !contractAddress) {
 alert('지갑을 연결하고 컨트랙트 주소를 확인해주세요.');
 return;
 }

 setPaymentStep('processing');
 setLoading(true);
 setMinting(true);
 
 try {
 const provider = new ethers.BrowserProvider((window as any).ethereum);
 const signer = await provider.getSigner();
 const contract = new ethers.Contract(contractAddress, SAU_ABI, signer);

 // 폼 데이터 처리
 const file = formData.get('file') as File;
 let content = formData.get('text') as string || '';
 let fileName = 'content.txt';
 const nftTitle = (formData.get('title') as string) || '';
 const nftDescription = (formData.get('description') as string) || '';
 
 // 커버 이미지 처리 (Pinata IPFS 업로드)
 let coverImageUrl: string | null = null;
 let coverImageMetadataUrl: string | null = null;
 let coverImageIpfsUrl: string | null = null;
 let coverImageMetadataIpfsUrl: string | null = null;
 const metadataUploadCache = new Map<string, { tokenURI: string; source: 'pinata-ipfs' | 'pinata-gateway' | 'pinata-metadata-api' | 'fallback'; ipfsHash: string | null }>();
 const placeholderImageUrl = 'https://via.placeholder.com/600x600.png?text=SAU+NFT';
 if (coverImage) {
  try {
  console.log(' 커버 이미지 Pinata IPFS 업로드 시작:', coverImage.name, coverImage.size, 'bytes');
  
  // Pinata IPFS에 업로드
  const imageFormData = new FormData();
  imageFormData.append('image', coverImage);
  imageFormData.append('title', nftTitle || coverImage.name);
  imageFormData.append('description', nftDescription || 'NFT Cover Image');
  
  const uploadResponse = await fetch('/api/upload-nft-image', {
  method: 'POST',
  body: imageFormData
  });
  
  const uploadData = await uploadResponse.json();
  
  if (uploadData.success) {
  coverImageUrl = uploadData.imageUrl;
  coverImageMetadataUrl = uploadData.metadataUrl;
  coverImageIpfsUrl = uploadData.image?.ipfsUrl || null;
  coverImageMetadataIpfsUrl = uploadData.metadata?.ipfsUrl || null;
  console.log(' 커버 이미지 Pinata IPFS 업로드 완료:', coverImageUrl);
  } else {
  console.warn(' Pinata 업로드 실패, base64로 폴백');
  // 폴백: base64로 변환
  const imageBase64 = await new Promise<string>((resolve, reject) => {
   const reader = new FileReader();
   reader.onload = () => resolve(reader.result as string);
   reader.onerror = reject;
   reader.readAsDataURL(coverImage);
  });
  coverImageUrl = imageBase64;
  }
  } catch (error) {
  console.error(' 커버 이미지 처리 실패:', error);
  }
 } else {
  console.log(' 커버 이미지 없음');
 }
 
 let isTextContent = false;
 let fileArrayBuffer: ArrayBuffer | null = null;
 
 if (file && file.size > 0) {
  fileName = file.name;
  try {
  fileArrayBuffer = await file.arrayBuffer();
  } catch (readError) {
  console.error('파일 읽기 실패:', readError);
  alert('파일을 읽는 중 오류가 발생했습니다.');
  setLoading(false);
  setMinting(false);
  return;
  }
 } else {
  // 파일이 없으면 텍스트 콘텐츠를 파일로 변환
  isTextContent = true;
  fileName = `nft_content_${Date.now()}.txt`;
 }

 const normalizedCreatorAddress = walletState.address ? walletState.address.toLowerCase() : '';

 const resolveTokenMetadata = async (tokenId: string, contentHash: string, index: number) => {
  if (metadataUploadCache.has(tokenId)) {
  return metadataUploadCache.get(tokenId)!.tokenURI;
  }

  const accessibleImageUrl =
  coverImageIpfsUrl ||
  (coverImageUrl && !coverImageUrl.startsWith('data:') ? coverImageUrl : placeholderImageUrl);

  const tokenEncryptionData = encryptionDataMap.get(tokenId);

  const metadataAttributes: Array<{ trait_type: string; value: string }> = [
  { trait_type: 'Token ID', value: tokenId.toString() },
  { trait_type: 'Batch Index', value: (index + 1).toString() },
  { trait_type: 'Creator', value: normalizedCreatorAddress || walletState.address || '' },
  { trait_type: 'Contract', value: contractAddress },
  { trait_type: 'Encrypted', value: (tokenEncryptionData || isTextContent) ? 'Yes' : 'No' }
  ];

  if (contentHash) {
  metadataAttributes.push({
  trait_type: 'Content Hash',
  value: contentHash
  });
  }

  metadataAttributes.push({
  trait_type: 'Minted At',
  value: new Date().toISOString()
  });

  const metadataPayload: Record<string, any> = {
  name: (nftTitle || fileName)
  ? `${(nftTitle || fileName).trim()}`
  : `SAU NFT`,
  description: nftDescription || `SAU 플랫폼에서 생성된 NFT`,
  image: accessibleImageUrl,
  external_url: accessibleImageUrl,
  attributes: metadataAttributes,
  properties: {
  contractAddress,
  tokenId,
  creator: normalizedCreatorAddress || walletState.address || '',
  contentHash,
  arweaveUrl: sharedContentUrl,
  encrypted: !!tokenEncryptionData || isTextContent,
  encryptionType: tokenEncryptionData?.encryptionType || (isTextContent ? 'web-crypto' : null),
  encryptionData: tokenEncryptionData || null,
  coverImageMetadataUrl,
  coverImageMetadataIpfsUrl
  }
  };

  if (coverImageUrl && coverImageUrl.startsWith('data:')) {
  metadataPayload.image_data = coverImageUrl;
  metadataAttributes.push({
  trait_type: 'Image Source',
  value: 'embedded-base64'
  });
  }

  try {
  const metadataResponse = await fetch('/api/upload-nft-metadata', {
  method: 'POST',
  headers: {
   'Content-Type': 'application/json'
  },
  body: JSON.stringify({
   metadata: metadataPayload,
   fileName: `metadata-${contractAddress}-${tokenId}.json`
  })
  });

  const metadataJson = await metadataResponse.json();

  if (metadataResponse.ok && metadataJson.success) {
  const preferredUri = metadataJson.ipfsUrl || metadataJson.metadataUrl;
  if (preferredUri) {
   metadataUploadCache.set(tokenId, {
   tokenURI: preferredUri,
   source: 'pinata-metadata-api',
   ipfsHash: metadataJson.ipfsHash || null
   });
   return preferredUri;
  }
  } else {
  console.warn(' 메타데이터 업로드 실패:', metadataJson);
  }
  } catch (error) {
  console.error(' 메타데이터 업로드 오류:', error);
  }

  const fallbackUri = `${window.location.origin}/api/unified?action=metadata&contractAddress=${contractAddress}&tokenId=${tokenId}`;
  metadataUploadCache.set(tokenId, {
  tokenURI: fallbackUri,
  source: 'fallback',
  ipfsHash: null
  });
  return fallbackUri;
 };

 // 1. Token ID 생성
 const preGeneratedTokenIds: string[] = [];
 const tokenId = generateTokenId(walletState.address, 0);
  preGeneratedTokenIds.push(tokenId);

 // 2. MINTER_ROLE 확인 및 자동 부여 (민팅 전 필수)
 try {
  const MINTER_ROLE = await contract.MINTER_ROLE();
  const hasRole = await contract.hasRole(MINTER_ROLE, walletState.address);
  console.log(' MINTER_ROLE 확인:', hasRole ? '보유 ' : '없음 ');
  
  if (!hasRole) {
  console.log(' MINTER_ROLE 자동 부여 시도 중...');
  
  // 사용자에게 알림
  const confirmed = window.confirm(
  ' NFT 생성 권한이 필요합니다!\n\n' +
  '컨트랙트 Owner만 권한을 부여할 수 있습니다.\n' +
  '현재 지갑이 Owner라면 "확인"을 눌러 권한을 부여하세요.\n\n' +
  'Owner가 아니라면 "취소"를 눌러 Owner에게 연락하세요.'
  );
  
  if (confirmed) {
  try {
   if (typeof contract.grantRole !== 'function') {
   throw new Error('grantRole 함수가 컨트랙트 ABI에 없습니다.');
   }
   const grantTx = await contract.grantRole(MINTER_ROLE, walletState.address);
   const grantReceipt = await grantTx.wait();
   if (!grantReceipt || grantReceipt.status !== 1) {
   throw new Error('MINTER_ROLE 부여 트랜잭션이 실패했습니다.');
   }
   console.log(' MINTER_ROLE 자동 부여 완료!');
   alert(' 권한 부여 완료! NFT 생성을 계속 진행합니다.');
  } catch (grantError: any) {
   console.error(' MINTER_ROLE 부여 실패:', grantError);
   alert(
   ' MINTER 권한 부여에 실패했습니다.\n\n' +
   '컨트랙트 Owner 계정으로 접속했는지 확인하거나,\n' +
   'Owner에게 MINTER 권한을 먼저 요청해주세요.'
   );
   setLoading(false);
   setMinting(false);
   return;
  }
  } else {
  alert(' NFT 생성이 취소되었습니다.\n\nOwner에게 권한 부여를 요청해주세요.');
  setLoading(false);
  setMinting(false);
  return;
  }
  }
 } catch (roleError: any) {
  console.error(' 권한 확인/부여 실패:', roleError.message);
  
  if (roleError.message?.includes('Ownable') || 
  roleError.message?.includes('not the owner') ||
  roleError.message?.includes('denied')) {
  alert(
  ' 권한 부여 실패!\n\n' +
  '원인: 현재 지갑이 컨트랙트 Owner가 아닙니다.\n\n' +
  '해결 방법:\n' +
  '1. Owner 계정으로 MetaMask를 전환하거나\n' +
  '2. Owner에게 연락하여 권한 부여를 요청하세요.\n\n' +
  `컨트랙트: ${contractAddress}\n` +
  `사용자 지갑: ${walletState.address}`
  );
  setLoading(false);
  setMinting(false);
  return;
  }

  alert(
  ' MINTER 권한 확인 중 알 수 없는 오류가 발생했습니다.\n\n' +
  '컨트랙트 권한 설정을 먼저 확인해주세요.'
  );
  setLoading(false);
  setMinting(false);
  return;
 }

 // 3. 콘텐츠 업로드/처리
 let sharedContentData = null;
 let sharedContentHash = '';
 let sharedContentUrl: string | null = null;
 const encryptionDataMap = new Map<string, any>(); // Token ID별 암호화 데이터
 
 console.log(' 공유 콘텐츠 업로드 및 암호화 시작...');
 
 // 최적화: 이미 읽은 content 재사용 (파일 재읽기 제거)
 if (file && fileArrayBuffer) {
  const base64Content = arrayBufferToBase64(fileArrayBuffer);
  sharedContentData = {
  type: 'file',
  content: base64Content,
  fileName: fileName,
  size: file.size,
  mimeType: file.type,
  encoding: 'base64'
  };
 } else if (content) {
  sharedContentData = {
  type: 'text',
  content: content,
  fileName: fileName,
  size: content.length,
  mimeType: 'text/plain',
  encoding: 'utf-8'
  };
 }
 
 // 공유 콘텐츠를 API로 업로드 (한 번만)
 if (sharedContentData) {
  try {
  console.groupCollapsed('[Arweave] 업로드 요청');
  console.log(' 업로드 정보', {
  fileName: sharedContentData.fileName,
  size: sharedContentData.size,
  mimeType: sharedContentData.mimeType,
  encoding: sharedContentData.encoding,
  contentPreview:
   typeof sharedContentData.content === 'string'
   ? `${sharedContentData.content.slice(0, 64)}${sharedContentData.content.length > 64 ? '...' : ''}`
   : '[binary]',
  });
  console.groupEnd();

  const uploadResponse = await fetch('/api/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
   action: 'upload_shared_content',
   content: sharedContentData.content,
   fileName: sharedContentData.fileName,
   contentType: sharedContentData.mimeType || 'text/plain',
   contentEncoding: sharedContentData.encoding,
   userAddress: walletState.address
  })
  });
  
  const uploadResult = await uploadResponse.json();
  console.groupCollapsed('[Arweave] 업로드 응답');
  console.log(' 업로드 결과', uploadResult);
  console.groupEnd();

  if (uploadResult.success) {
  sharedContentHash = uploadResult.contentId;
  sharedContentUrl = uploadResult.contentUrl || null;
  console.log(' 공유 콘텐츠 업로드 완료:', uploadResult.contentUrl);
  } else {
  console.warn('공유 콘텐츠 업로드 실패:', uploadResult.error);
  sharedContentHash = `Qm${sharedContentData.fileName.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}`;
  sharedContentUrl = sharedContentHash ? `https://arweave.net/${sharedContentHash}` : null;
  }
  } catch (error) {
  console.error('공유 콘텐츠 업로드 오류:', error);
  sharedContentHash = `Qm${sharedContentData.fileName.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}`;
  sharedContentUrl = sharedContentHash ? `https://arweave.net/${sharedContentHash}` : null;
  }
 }
 
 // 3. 각 Token ID마다 개별 암호화 (올바른 접근 제어를 위해)
 if (file && fileArrayBuffer) {
  console.log(' 파일 암호화 시작...');
  
  for (const tokenId of preGeneratedTokenIds) {
  try {
  console.groupCollapsed(`[Encryption] 파일 토큰 ${tokenId}`);
  const encryptionResult = await encryptFile(
   file,
   tokenId,
   contractAddress
  );

  if (encryptionResult.encryptionType === 'lit-protocol') {
   console.log(' Lit 암호화 결과', {
   dataToEncryptHash: encryptionResult.dataToEncryptHash,
   accessControl: encryptionResult.accessControlConditions,
   });
   encryptionDataMap.set(tokenId, {
   encryptionType: 'lit-protocol',
   ciphertext: encryptionResult.ciphertext,
   dataToEncryptHash: encryptionResult.dataToEncryptHash,
   accessControlConditions: encryptionResult.accessControlConditions,
   fileMetadata: encryptionResult.fileMetadata,
   mimeType: encryptionResult.mimeType,
   encoding: encryptionResult.encoding,
   originalContent: null
   });
  } else {
   console.log(' Web Crypto 암호화 결과', {
   encryptedFileLength: encryptionResult.encryptedFile?.length ?? 0,
   symmetricKeyPreview: encryptionResult.encryptedSymmetricKey?.slice(0, 16),
   accessControl: encryptionResult.accessControlConditions,
   });
   encryptionDataMap.set(tokenId, {
   encryptionType: 'web-crypto',
   encryptedFile: encryptionResult.encryptedFile,
   encryptedSymmetricKey: encryptionResult.encryptedSymmetricKey,
   accessControlConditions: encryptionResult.accessControlConditions,
   fileMetadata: encryptionResult.fileMetadata,
   mimeType: encryptionResult.mimeType,
   encoding: encryptionResult.encoding,
   originalContent: null
   });
  }
  
  console.log(` Token ID ${tokenId} 파일 암호화 완료`);
  console.groupEnd();
  } catch (encryptionError) {
  console.error(` Token ID ${tokenId} 파일 암호화 실패:`, encryptionError);
  console.groupEnd();
  }
  }
 } else if (content) {
  console.log(' 각 NFT별 텍스트 암호화 시작...');
  
  for (const tokenId of preGeneratedTokenIds) {
  try {
  console.groupCollapsed(`[Encryption] 텍스트 토큰 ${tokenId}`);
  // Web Crypto API 사용 (각 Token ID로)
  const encryptionResult = await processTextAsFile(
   content,
   fileName,
   walletState.address,
   tokenId, // 실제 Token ID 사용!
   contractAddress
  );

  if (encryptionResult.encryptionType === 'lit-protocol') {
   console.log(' Lit 암호화 결과', {
   dataToEncryptHash: encryptionResult.dataToEncryptHash,
   accessControl: encryptionResult.accessControlConditions,
   });
   encryptionDataMap.set(tokenId, {
   encryptionType: 'lit-protocol',
   ciphertext: encryptionResult.ciphertext,
   dataToEncryptHash: encryptionResult.dataToEncryptHash,
   accessControlConditions: encryptionResult.accessControlConditions,
   fileMetadata: encryptionResult.fileMetadata,
   mimeType: encryptionResult.mimeType,
   encoding: encryptionResult.encoding,
   originalContent: null
   });
  } else {
   console.log(' Web Crypto 암호화 결과', {
   encryptedFileLength: encryptionResult.encryptedFile?.length ?? 0,
   symmetricKeyPreview: encryptionResult.encryptedSymmetricKey?.slice(0, 16),
   accessControl: encryptionResult.accessControlConditions,
   });
   encryptionDataMap.set(tokenId, {
   encryptionType: 'web-crypto',
   encryptedFile: encryptionResult.encryptedFile,
   encryptedSymmetricKey: encryptionResult.encryptedSymmetricKey,
   accessControlConditions: encryptionResult.accessControlConditions,
   fileMetadata: encryptionResult.fileMetadata,
   mimeType: encryptionResult.mimeType,
   encoding: encryptionResult.encoding,
   originalContent: null
   });
  }
  
  console.log(` Token ID ${tokenId} 암호화 완료`);
  console.groupEnd();
  } catch (encryptionError) {
  console.error(` Token ID ${tokenId} 암호화 실패:`, encryptionError);
  console.groupEnd();
  }
  }
 }

 const results = [];
 let successCount = 0;
 let failureCount = 0;

 console.log(' NFT 민팅 시작 (단일 모드)');
 
 try {
  const tokenId = preGeneratedTokenIds[0];
  const contentHash = sharedContentHash;
  const tokenEncryptionData = encryptionDataMap.get(tokenId);
  const resolvedTokenURI = await resolveTokenMetadata(tokenId, contentHash, 0);
  
  const tx = await contract.mintWithMetadata(
  walletState.address,
  tokenId,
  nftAmount,
  contentHash,
  resolvedTokenURI,
  { gasLimit: 320000 }
  );
  
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
  throw new Error('NFT 민팅 트랜잭션이 실패했습니다.');
  }

  const mintedBalance = await contract.balanceOf(walletState.address, tokenId);
  const mintedBalanceBigInt = typeof mintedBalance === 'bigint'
  ? mintedBalance
  : BigInt(mintedBalance?.toString?.() ?? '0');
  if (mintedBalanceBigInt === 0n) {
  throw new Error('NFT 민팅 이후 잔액이 0입니다. 민팅이 완료되지 않았습니다.');
  }
  
  const metadataInfo = metadataUploadCache.get(tokenId);
  const finalTokenURI = metadataInfo?.tokenURI || resolvedTokenURI;

  console.groupCollapsed('[Mint] 성공');
  console.log(' 민팅 정보', {
  tokenId,
  transactionHash: tx.hash,
  blockNumber: receipt.blockNumber,
  tokenURI: finalTokenURI,
  encryptionType: tokenEncryptionData?.encryptionType || 'unknown',
  metadataSource: metadataInfo?.source,
  });
  console.groupEnd();
  
  results.push({
  nftNumber: 1,
  tokenId,
  contentHash,
  transactionHash: tx.hash,
  blockNumber: receipt.blockNumber,
  success: true,
  encryptionData: tokenEncryptionData,
  isTextContent,
  fileName,
  tokenURI: finalTokenURI,
  metadataSource: metadataInfo?.source || (coverImageMetadataIpfsUrl ? 'pinata-ipfs' : coverImageMetadataUrl ? 'pinata-gateway' : 'fallback'),
  metadataIpfsHash: metadataInfo?.ipfsHash || null
  });
  
  successCount = 1;
 } catch (error: any) {
  console.error('NFT 민팅 실패:', error);
  console.groupCollapsed('[Mint] 실패');
  console.error(' 민팅 에러 상세', error);
  console.groupEnd();
  
  results.push({
  nftNumber: 1,
  success: false,
  error: error.message || '알 수 없는 오류'
  });
  
  failureCount = 1;
 }
 
 const hasEncryptionData = encryptionDataMap.size > 0;

 setResult({
  success: successCount > 0,
  totalRequested: 1,
  successCount: successCount,
  failureCount: failureCount,
  results: results,
  coverImage: coverImageUrl || coverImageIpfsUrl ? {
  url: coverImageUrl || null,
  ipfsUrl: coverImageIpfsUrl || null,
  metadataUrl: coverImageMetadataUrl || null,
  metadataIpfsUrl: coverImageMetadataIpfsUrl || null,
  name: coverImage?.name || null,
  type: coverImage?.type || null
  } : null,
  message: `${successCount}개의 NFT가 성공적으로 생성되었습니다! ${failureCount > 0 ? `(${failureCount}개 실패)` : ''}`,
  hasEncryption: hasEncryptionData || isTextContent
 });
 
 setPaymentStep('estimate');
 
 } catch (error: any) {
 console.error('NFT 민팅 실패:', error);
 
 let errorMessage = '알 수 없는 오류가 발생했습니다.';
 
 if (error.message) {
  errorMessage = error.message;
 } else if (error.reason) {
  errorMessage = error.reason;
 } else if (error.code) {
  errorMessage = `오류 코드: ${error.code}`;
 }
 
 setResult({
  success: false,
  error: errorMessage,
  message: 'NFT 생성에 실패했습니다.'
 });
 
 setPaymentStep('payment');
 } finally {
 setLoading(false);
 setMinting(false);
 }
 };

 // 비용 계산 함수
 const calculateCost = async (contentSize: number) => {
 try {
 const gasResponse = await fetch('/api/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
  action: 'calculate_cost',
  nftCount: nftAmount,
  contentSize
  }),
 });
 
 const gasData = await gasResponse.json();
 setCostEstimate(gasData);
 setShowCostBreakdown(true);
 } catch (error) {
 console.error('Cost calculation error:', error);
 }
 };

 const handleCreateNFT = async (formData: FormData) => {
 setLoading(true);
 try {
 const file = formData.get('file') as File;
 let content = formData.get('text') as string || '';
 let fileName = 'content.txt';
 
 // 파일이 선택된 경우 파일 내용을 읽기
 if (file && file.size > 0) {
  fileName = file.name;
  content = await file.text();
 }
 
 const nftData = {
  action: 'create_nft_with_access_control',
  walletAddress: formData.get('walletAddress'),
  nftCount: nftAmount,
  title: formData.get('title'),
  description: formData.get('description'),
  content: content,
  fileName: fileName
 };
 
 const response = await fetch('/api/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(nftData),
 });
 const responseResult = await response.json();
 setResult(responseResult);
 } catch (error) {
 console.error('NFT creation error:', error);
 } finally {
 setLoading(false);
 }
 };

 return (
 <div style={{ 
 minHeight: '100vh', 
 backgroundColor: '#f8fafc',
 padding: '16px',
 fontFamily: 'system-ui, -apple-system, sans-serif',
 width: '100%',
 overflowX: 'hidden',
 boxSizing: 'border-box'
 }}>
 <div style={{ 
  maxWidth: '800px', 
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box'
 }}>
  {/* 네비게이션 */}
  <nav style={{ 
  display: 'flex', 
  justifyContent: 'space-between', 
  alignItems: 'center',
  marginBottom: '32px',
  padding: '16px 0',
  borderBottom: '1px solid #e5e7eb',
  flexWrap: 'wrap',
  gap: '12px'
  }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
  <Link href="/" style={{ 
   fontSize: 'clamp(18px, 4vw, 24px)', 
   fontWeight: 'bold', 
   color: '#1f2937',
   textDecoration: 'none'
  }}>
   SAU 플랫폼
  </Link>
  <span style={{
   fontSize: '12px',
   padding: '4px 12px',
   backgroundColor: '#dbeafe',
   color: '#1e40af',
   borderRadius: '12px',
   fontWeight: '600'
  }}>
   Sepolia
  </span>
  </div>
  <div style={{ display: 'flex', gap: 'clamp(12px, 3vw, 16px)', flexWrap: 'wrap' }}>
  <Link href="/create" style={{ 
   color: '#3b82f6', 
   textDecoration: 'none',
   fontWeight: '500',
   fontSize: 'clamp(14px, 3vw, 16px)'
  }}>
   NFT 생성
  </Link>
  <Link href="/access" style={{ 
   color: '#6b7280', 
   textDecoration: 'none',
   fontWeight: '500',
   fontSize: 'clamp(14px, 3vw, 16px)'
  }}>
   데이터 접근
  </Link>
  </div>
  </nav>

  <h1 style={{ 
  textAlign: 'center', 
  color: '#1f2937',
  marginBottom: '32px',
  fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
  lineHeight: '1.3',
  padding: '0 16px'
  }}>
  NFT 생성 및 자동 접근 제어 설정
  </h1>

  <div style={{ 
  backgroundColor: 'white',
  borderRadius: '12px',
  padding: 'clamp(16px, 4vw, 24px)',
  marginBottom: '20px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  width: '100%',
  boxSizing: 'border-box'
  }}>
  <p style={{ color: '#6b7280', marginBottom: '20px', fontSize: '14px' }}>
  NFT를 생성하면 콘텐츠가 자동으로 암호화되고, NFT 소유자만 접근할 수 있습니다.
  </p>
  
  <form onSubmit={(e) => {
  e.preventDefault();
  const formData = new FormData(e.target as HTMLFormElement);
  mintNFT(formData);
  }}>
  {/* MetaMask 연결 상태 */}
  <div style={{ marginBottom: '16px' }}>
   <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
   지갑 연결:
   </label>
   {!walletState.isConnected ? (
   <button
   type="button"
   onClick={connectWallet}
   disabled={loading}
   style={{
    backgroundColor: loading ? '#9ca3af' : '#f59e0b',
    color: 'white',
    padding: '12px 24px',
    border: 'none',
    borderRadius: '6px',
    cursor: loading ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
   }}
   >
   {loading ? '연결 중...' : ' MetaMask 연결'}
   </button>
   ) : (
   <div style={{ 
   padding: '12px',
   backgroundColor: '#dcfce7',
   border: '1px solid #22c55e',
   borderRadius: '6px',
   fontSize: '14px'
   }}>
   <div style={{ fontWeight: '500', color: '#166534', marginBottom: '4px', fontSize: 'clamp(0.875rem, 2.5vw, 1rem)' }}>
    MetaMask 연결됨
   </div>
   <div style={{ color: '#15803d', fontFamily: 'monospace', fontSize: 'clamp(0.7rem, 2vw, 0.75rem)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
    {walletState.address.slice(0, 10)}...{walletState.address.slice(-8)}
   </div>
   <div style={{ color: '#15803d', fontSize: 'clamp(0.7rem, 2vw, 0.75rem)', marginTop: '4px' }}>
    잔액: {parseFloat(walletState.balance).toFixed(4)} ETH
   </div>
   </div>
   )}
  </div>
  
  {/* 커버 이미지 업로드 섹션 */}
  <div style={{ marginBottom: '16px' }}>
   <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
   NFT 커버 이미지 (선택사항):
   </label>
   <div style={{ 
   border: '2px dashed #d1d5db', 
   borderRadius: '8px', 
   padding: '20px', 
   textAlign: 'center',
   backgroundColor: '#f9fafb'
   }}>
   <input
   type="file"
   id="cover-image-upload"
   ref={coverImageInputRef}
   accept="image/*"
   style={{ display: 'none' }}
   onChange={handleImageUpload}
   />
   {imageLoading ? (
   <div style={{ padding: '20px' }}>
    <div style={{ 
    display: 'inline-block',
    width: '40px',
    height: '40px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
    }} />
    <p style={{ margin: '10px 0 0 0', fontSize: '14px', color: '#6b7280' }}>
    이미지 처리 중...
    </p>
    <style dangerouslySetInnerHTML={{ __html: `
    @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
    }
    `}} />
   </div>
   ) : coverImagePreview ? (
   <div>
    <img 
    src={coverImagePreview} 
    alt="커버 이미지 미리보기" 
    style={{ 
    maxWidth: '200px', 
    maxHeight: '200px', 
    borderRadius: '8px',
    marginBottom: '10px'
    }} 
    />
    <div>
    <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#374151' }}>
    {coverImage?.name} ({((coverImage?.size || 0) / 1024 / 1024).toFixed(2)} MB)
    </p>
    <button
    type="button"
    onClick={handleImageRemove}
    style={{
     padding: '8px 16px',
     backgroundColor: '#ef4444',
     color: 'white',
     border: 'none',
     borderRadius: '6px',
     cursor: 'pointer',
     fontSize: '14px'
    }}
    >
    이미지 제거
    </button>
    </div>
   </div>
   ) : (
   <div>
    <button
    type="button"
    onClick={() => {
    coverImageInputRef.current?.click();
    }}
    disabled={imageLoading}
    style={{
    display: 'inline-block',
    padding: '12px 24px',
    backgroundColor: imageLoading ? '#9ca3af' : '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: imageLoading ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s'
    }}
    >
    이미지 선택
    </button>
    <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
    JPG, PNG, GIF, WebP 형식 (최대 10MB, 자동 압축)
    </p>
   </div>
   )}
   </div>
  </div>
  
  <div style={{ marginBottom: '16px' }}>
   <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: 'clamp(0.875rem, 2.5vw, 1rem)' }}>
   발급 수량:
   </label>
   <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 1.5vw, 8px)', flexWrap: 'wrap' }}>
   <input 
   type="number" 
   min="1"
   max="1000"
   value={nftAmount}
   onChange={(e) => {
    const value = parseInt(e.target.value) || 1;
    const newAmount = Math.max(1, Math.min(1000, value));
    setNftAmount(newAmount);
    const file = (document.querySelector('input[name="file"]') as HTMLInputElement)?.files?.[0];
    const textContent = (document.querySelector('textarea[name="text"]') as HTMLTextAreaElement)?.value || '';
    const contentSize = file ? file.size : textContent.length;
    if (contentSize > 0) {
    calculateCost(contentSize);
    }
   }}
   style={{ 
    width: 'clamp(100px, 20vw, 120px)',
    padding: 'clamp(6px, 1.5vw, 8px)',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '16px'
   }}
   />
   <span style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#6b7280' }}>
   개 (1~1000)
   </span>
   </div>
  </div>
  
  <div style={{ marginBottom: '16px' }}>
   <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
   NFT 제목:
   </label>
   <input 
   type="text" 
   name="title"
   placeholder="NFT 제목을 작성해 주십시오"
   style={{ 
   width: '100%',
   padding: '8px',
   border: '1px solid #d1d5db',
   borderRadius: '6px'
   }}
   />
  </div>
  
  <div style={{ marginBottom: '16px' }}>
   <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
   NFT 설명:
   </label>
   <textarea 
   name="description"
   placeholder="NFT에 대한 설명을 작성하여주십시오"
   style={{ 
   width: '100%',
   height: '80px',
   padding: '8px',
   border: '1px solid #d1d5db',
   borderRadius: '6px',
   resize: 'vertical'
   }}
   />
  </div>
  
  <div style={{ marginBottom: '16px' }}>
   <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
   파일 선택:
   </label>
   <input 
   type="file" 
   name="file"
   accept=".txt,.md,.json,.csv,.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.mp4,.mp3"
   disabled={inputMode === 'text'}
   onChange={(e) => {
   const file = e.target.files?.[0];
   if (file) {
    setInputMode('file');
    calculateCost(file.size);
    // 텍스트 입력 초기화
    const textArea = document.querySelector('textarea[name="text"]') as HTMLTextAreaElement;
    if (textArea) {
    textArea.value = '';
    }
   } else {
    setInputMode(null);
   }
   }}
   style={{ 
   width: '100%',
   padding: '8px',
   border: '1px solid #d1d5db',
   borderRadius: '6px',
   backgroundColor: inputMode === 'text' ? '#f3f4f6' : 'white',
   cursor: inputMode === 'text' ? 'not-allowed' : 'pointer',
   opacity: inputMode === 'text' ? 0.6 : 1
   }}
   />
   <p style={{ 
   margin: '4px 0 0 0', 
   fontSize: '12px', 
   color: inputMode === 'text' ? '#9ca3af' : '#6b7280' 
   }}>
   {inputMode === 'text' ? '텍스트를 입력 중이므로 파일 선택이 비활성화되었습니다.' : '파일을 선택하면 텍스트 입력이 비활성화됩니다. 텍스트, 이미지, 문서 등 다양한 형식을 지원합니다.'}
   </p>
  </div>
  
  <div style={{ marginBottom: '16px' }}>
   <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
   텍스트 콘텐츠:
   </label>
   <textarea 
   name="text"
   placeholder="파일을 업로드하거나 텍스트를 작성하여 넣어주십시오"
   disabled={inputMode === 'file'}
   onChange={(e) => {
   const textContent = e.target.value;
   if (textContent.trim()) {
    setInputMode('text');
    // 파일 입력 초기화
    const fileInput = document.querySelector('input[name="file"]') as HTMLInputElement;
    if (fileInput) {
    fileInput.value = '';
    }
   } else {
    setInputMode(null);
   }
   const file = (document.querySelector('input[name="file"]') as HTMLInputElement)?.files?.[0];
   const contentSize = file ? file.size : textContent.length;
   calculateCost(contentSize);
   }}
   style={{ 
   width: '100%',
   height: '100px',
   padding: '8px',
   border: '1px solid #d1d5db',
   borderRadius: '6px',
   resize: 'vertical',
   backgroundColor: inputMode === 'file' ? '#f3f4f6' : 'white',
   cursor: inputMode === 'file' ? 'not-allowed' : 'text',
   opacity: inputMode === 'file' ? 0.6 : 1
   }}
   />
   <div style={{ 
   display: 'flex', 
   justifyContent: 'space-between', 
   alignItems: 'center',
   marginTop: '4px'
   }}>
   <p style={{ 
   margin: '0', 
   fontSize: '12px', 
   color: inputMode === 'file' ? '#9ca3af' : '#6b7280' 
   }}>
   {inputMode === 'file' ? '파일을 선택했으므로 텍스트 입력이 비활성화되었습니다.' : '텍스트를 입력하면 파일 선택이 비활성화됩니다.'}
   </p>
   {inputMode && (
   <button
    type="button"
    onClick={() => {
    setInputMode(null);
    // 파일 입력 초기화
    const fileInput = document.querySelector('input[name="file"]') as HTMLInputElement;
    if (fileInput) {
    fileInput.value = '';
    }
    // 텍스트 입력 초기화
    const textArea = document.querySelector('textarea[name="text"]') as HTMLTextAreaElement;
    if (textArea) {
    textArea.value = '';
    }
    calculateCost(0);
    }}
    style={{
    padding: '4px 8px',
    fontSize: '11px',
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.2s'
    }}
    onMouseOver={(e) => {
    e.currentTarget.style.backgroundColor = '#e5e7eb';
    }}
    onMouseOut={(e) => {
    e.currentTarget.style.backgroundColor = '#f3f4f6';
    }}
   >
    초기화
   </button>
   )}
   </div>
  </div>

  {/* 비용 계산 섹션 */}
  {showCostBreakdown && costEstimate && (
   <div style={{ 
   marginBottom: '16px',
   padding: '16px',
   backgroundColor: '#f8fafc',
   border: '1px solid #e2e8f0',
   borderRadius: '8px'
   }}>
   <h4 style={{ 
   margin: '0 0 12px 0',
   fontSize: '16px',
   fontWeight: '600',
   color: '#374151'
   }}>
    발행 비용 상세 (발행자 부담)
   </h4>
   <div style={{ 
   display: 'grid',
   gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
   gap: '12px',
   marginBottom: '12px'
   }}>
   <div style={{ 
    padding: '8px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #d1d5db'
   }}>
    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>
    이더리움 가스비
    </div>
    <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
    {costEstimate.ethereumGas} ETH
    </div>
   </div>
   </div>
   </div>
  )}
  
  <button 
   type="submit"
   disabled={loading || !walletState.isConnected}
   style={{
   backgroundColor: !walletState.isConnected ? '#9ca3af' : paymentStep === 'processing' ? '#10b981' : '#3b82f6',
   color: 'white',
   padding: '12px 24px',
   border: 'none',
   borderRadius: '6px',
   cursor: (loading || !walletState.isConnected) ? 'not-allowed' : 'pointer',
   opacity: (loading || !walletState.isConnected) ? 0.6 : 1,
   fontSize: '16px',
   fontWeight: '500'
   }}
  >
   {!walletState.isConnected 
   ? 'MetaMask 연결 필요' 
   : paymentStep === 'processing' 
   ? ' NFT 생성 중...' 
   : ' NFT 생성하기'
   }
  </button>
  </form>

  {result && (
  <div style={{ 
   marginTop: '20px',
   padding: '16px',
   backgroundColor: result.success ? '#f0f9ff' : '#fef2f2',
   border: `1px solid ${result.success ? '#0ea5e9' : '#f87171'}`,
   borderRadius: '8px'
  }}>
   <h3 style={{ 
   margin: '0 0 12px 0', 
   color: result.success ? '#0c4a6e' : '#991b1b',
   fontSize: '18px'
   }}>
   {result.success ? ' NFT 생성 완료!' : ' NFT 생성 실패'}
   </h3>
   
   {/* 생성 결과 요약 */}
   {result.totalRequested && (
   <div style={{ 
   marginBottom: '16px',
   padding: '12px',
   backgroundColor: result.success ? '#dcfce7' : '#fef3c7',
   border: `1px solid ${result.success ? '#22c55e' : '#f59e0b'}`,
   borderRadius: '6px'
   }}>
   <div style={{ 
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '12px',
    textAlign: 'center'
   }}>
    <div>
    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>
    요청된 NFT
    </div>
    <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>
    {result.totalRequested}개
    </div>
    </div>
    <div>
    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>
    성공한 NFT
    </div>
    <div style={{ fontSize: '16px', fontWeight: '600', color: '#22c55e' }}>
    {result.successCount}개
    </div>
    </div>
    {result.failureCount > 0 && (
    <div>
    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>
     실패한 NFT
    </div>
    <div style={{ fontSize: '16px', fontWeight: '600', color: '#ef4444' }}>
     {result.failureCount}개
    </div>
    </div>
    )}
   </div>
   </div>
   )}

   <p style={{ 
   margin: '0 0 24px 0',
   fontSize: '18px',
    fontWeight: '600',
   color: result.success ? '#0c4a6e' : '#991b1b',
   textAlign: 'center'
   }}>
   {result.message}
   </p>

   {result.success && (
   <div style={{ 
   marginTop: '12px',
   padding: '12px',
   backgroundColor: '#e0f2fe',
   borderRadius: '6px',
   border: '1px solid #0891b2'
   }}>
   <p style={{ margin: '0 0 8px 0', fontWeight: '500', color: '#0c4a6e' }}>
    다음 단계:
   </p>
   <p style={{ margin: '0', fontSize: '14px', color: '#0369a1' }}>
    <Link href="/access" style={{ color: '#0369a1', textDecoration: 'underline' }}>
    데이터 접근 페이지
    </Link>에서 NFT 소유권을 확인하여 암호화된 데이터에 접근해보세요!
   </p>
   </div>
   )}
  </div>
  )}
  </div>

 </div>
 </div>
 );
}
