"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { decryptFileWithWebCrypto, createDownloadableBlob, downloadFile } from '@/lib/file-encryption';
import { BrowserProvider, Contract } from 'ethers';

const base64ToUint8Array = (base64: string): Uint8Array => {
 const normalized = base64.replace(/[^A-Za-z0-9+/=]/g, '');
 const binaryString = atob(normalized);
 const length = binaryString.length;
 const bytes = new Uint8Array(length);
 for (let i = 0; i < length; i++) {
 bytes[i] = binaryString.charCodeAt(i);
 }
 return bytes;
};

export default function AccessDataPage() {
 const [result, setResult] = useState<any>(null);
 const [loading, setLoading] = useState(false);
 const [walletConnected, setWalletConnected] = useState(false);
 const [walletAddress, setWalletAddress] = useState<string>('');
 const [nftOwnership, setNftOwnership] = useState<any>(null);
 const [userNFTs, setUserNFTs] = useState<any[]>([]);
 const [loadingNFTs, setLoadingNFTs] = useState(false);
 const [decryptingFile, setDecryptingFile] = useState(false);
 const [burningNFT, setBurningNFT] = useState(false);
 const [burnStatus, setBurnStatus] = useState<{
 step: 'idle' | 'validating' | 'signing' | 'pending' | 'success' | 'error';
 message?: string;
 txHash?: string;
 }>({ step: 'idle' });
 const [showBurnConfirm, setShowBurnConfirm] = useState(false);
 const [confirmBurnTarget, setConfirmBurnTarget] = useState<any | null>(null);
 const previewUrlRef = useRef<string | null>(null);
 const autoDecryptedKeyRef = useRef<string | null>(null);

 useEffect(() => {
 return () => {
 if (previewUrlRef.current) {
  URL.revokeObjectURL(previewUrlRef.current);
  previewUrlRef.current = null;
 }
 };
 }, []);

 // MetaMask 연결 함수
 const connectWallet = async () => {
 if (typeof window !== 'undefined' && (window as any).ethereum) {
 try {
  const accounts = await (window as any).ethereum.request({
  method: 'eth_requestAccounts',
  });
  
  if (accounts.length > 0) {
  const account = accounts[0];
  setWalletAddress(account);
  setWalletConnected(true);
  setBurnStatus({ step: 'idle' });
  // 연결 즉시 NFT 목록 조회
  await fetchUserNFTs(account);
  }
 } catch (error) {
  console.error('MetaMask 연결 실패:', error);
  alert('MetaMask 연결에 실패했습니다.');
 }
 } else {
 alert('MetaMask가 설치되지 않았습니다.');
 }
 };

 // 사용자 NFT 목록 조회 함수
 const fetchUserNFTs = async (address: string) => {
 setLoadingNFTs(true);
 setUserNFTs([]); // 초기화
 try {
 // 올바른 컨트랙트 주소 사용
 const contractAddress =
  process.env.NEXT_PUBLIC_SAU_CONTRACT_ADDRESS ||
  process.env.SAU_CONTRACT_ADDRESS ||
  '0x64cAf3Bd2F96304Ee8Dc3D46Ea816B2e5bfbB902';
 
 console.log(` NFT 조회 시작 (블록체인 원본) - 컨트랙트: ${contractAddress}, 사용자: ${address}`);
 
 // 블록체인/서버에서 직접 조회
 const response = await fetch('/api/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
  action: 'get_user_nfts',
  userAddress: address,
  contractAddress: contractAddress
  }),
 });

 const nftData = await response.json();
 console.log(' API 응답:', nftData);
 
 const normalizedNFTs: any[] = [];
 if (nftData.success && nftData.nfts && nftData.nfts.length > 0) {
  console.log(` 블록체인에서 ${nftData.nfts.length}개 NFT 발견`);
  normalizedNFTs.push(
  ...nftData.nfts.map((nft: any) => ({
  ...nft,
  source: nftData.isRealBlockchain ? 'onchain' : 'api-cache'
  }))
  );
 } else {
  console.warn(' API에서 NFT를 찾지 못했습니다:', nftData.message);
 }
 
 if (normalizedNFTs.length === 0) {
  console.warn(' 온체인 NFT를 찾지 못했습니다. 연결 상태와 컨트랙트 주소를 확인하세요.');
 }
 
 setUserNFTs(normalizedNFTs);
 } catch (error) {
 console.error(' NFT 목록 조회 실패:', error);
 setUserNFTs([]);
 } finally {
 setLoadingNFTs(false);
 }
 };

 // NFT 선택 및 접근 함수
 const selectNFT = async (nft: any) => {
 setLoading(true);
 try {
 console.log(' NFT 선택:', nft);
 
 // 1. NFT 소유권 확인
 const ownershipResponse = await fetch('/api/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
  action: 'check_nft_ownership',
  contractAddress: nft.contractAddress,
  tokenId: nft.tokenId,
  userAddress: walletAddress
  }),
 });

 const ownershipResult = await ownershipResponse.json();
 setNftOwnership(ownershipResult);

 if (!ownershipResult.success || !ownershipResult.hasOwnership) {
  alert('이 NFT를 소유하고 있지 않습니다.');
  return;
 }

 // 2. NFT 메타데이터 조회
 console.log(' NFT 메타데이터 조회 중...');
 const metadataResponse = await fetch('/api/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
  action: 'get_nft_metadata',
  contractAddress: nft.contractAddress,
  tokenId: nft.tokenId
  }),
 });

 const metadataResult = await metadataResponse.json();
 console.log(' 메타데이터 조회 결과:', metadataResult);
 
 if (metadataResult.success && metadataResult.hasData && metadataResult.metadata) {
  const metadata = metadataResult.metadata;
  const properties = metadata.properties || {};
  const encryptionInfo =
  properties.encryptionData ||
  properties.encryption?.encryptionData ||
  metadata.encryptionData ||
  null;
  const normalizedEncryptionType =
  properties.encryptionType ||
  metadata.encryptionType ||
  (encryptionInfo ? encryptionInfo.encryptionType : null);
  const hasEncryptedPayload =
  !!encryptionInfo &&
  (Array.isArray(encryptionInfo.encryptedFile) ||
  typeof encryptionInfo.encryptedString === 'string');
  const isTextContent =
  normalizedEncryptionType === 'web-crypto' ||
  (properties.encrypted !== undefined ? properties.encrypted : undefined) ||
  metadata.isTextContent ||
  hasEncryptedPayload;
  const contentHash = properties.contentHash || nft.contentHash;
  const originalContent =
  encryptionInfo?.originalContent ||
  properties.originalContent ||
  metadata.originalContent ||
  null;

  const baseResult = {
  success: true,
  message: 'NFT에 연결된 데이터를 찾았습니다!',
  decryptedContent: isTextContent
  ? ' 암호화된 텍스트 콘텐츠 (복호화 필요)'
  : ' 암호화된 파일 (다운로드 후 복호화 필요)',
  encryptionData: encryptionInfo,
  fileName: metadata.file_name || metadata.name || nft.fileName || 'content.txt',
  isTextContent,
  contentHash,
  createdAt: properties.createdAt || new Date().toISOString(),
  coverImageUrl: metadata.image || nft.coverImageUrl || null,
  tokenURI: metadataResult.tokenURI
  };

  setResult(baseResult);

  // 암호화되지 않은 콘텐츠만 자동 로드
  if (!isTextContent && properties.arweaveUrl && !encryptionInfo) {
  try {
  const contentResponse = await fetch(properties.arweaveUrl);
  const rawContent = await contentResponse.text();
  setResult((prev: any) => ({
   ...prev,
   decryptedContent: rawContent,
   message: 'NFT에 연결된 데이터를 찾았습니다!'
  }));
  } catch (arweaveError) {
  console.warn('Arweave 콘텐츠 조회 실패:', arweaveError);
  }
  }
  return;
 }

 console.log(' 메타데이터를 확인할 수 없어 테스트 API로 폴백합니다.');
 await handleAccessTest({
  contractAddress: nft.contractAddress,
  tokenId: nft.tokenId,
  userAddress: walletAddress
 });
 } catch (error) {
 console.error('NFT 접근 실패:', error);
 alert('NFT 접근에 실패했습니다.');
 } finally {
 setLoading(false);
 }
 };

 function classifyContentType(mimeType?: string | null) {
 if (!mimeType) {
 return { label: '파일', icon: '', variant: 'default' as const };
 }

 if (mimeType.startsWith('image/')) {
 return { label: '이미지', icon: '', variant: 'image' as const };
 }
 if (mimeType.startsWith('video/')) {
 return { label: '영상', icon: '', variant: 'video' as const };
 }
 if (mimeType.startsWith('audio/')) {
 return { label: '오디오', icon: '', variant: 'audio' as const };
 }
 if (mimeType === 'application/pdf') {
 return { label: 'PDF', icon: '', variant: 'pdf' as const };
 }
 if (mimeType.startsWith('text/')) {
 return { label: '텍스트', icon: '', variant: 'text' as const };
 }
 return { label: '파일', icon: '', variant: 'default' as const };
 }

 function resolvePreviewUrl(resultData: any, variant?: 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'default'): string | null {
 if (!resultData) return null;
 const metadata = resultData.metadata || {};
 const properties = metadata.properties || {};
 const candidates = [
 properties.coverImageUrl,
 properties.coverImage,
 properties.coverImageMetadataUrl,
 metadata.image,
 ];
 for (const url of candidates) {
 if (typeof url === 'string' && url.trim().length > 0) {
  const trimmed = url.trim();
  if (variant === 'image' || variant === 'video') {
  return trimmed;
  }
  if (trimmed.startsWith('data:image')) {
  return trimmed;
  }
 }
 }
 return null;
 }

 function formatBytes(bytes?: number | null) {
 if (!bytes || Number.isNaN(Number(bytes)) || bytes <= 0) {
 return null;
 }
 const k = 1024;
 const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB'];
 const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
 const value = bytes / Math.pow(k, i);
 const formatted = value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1);
 return `${formatted} ${sizes[i]}`;
 }

 function shortenDisplayText(value?: string | null, maxLength = 40) {
 if (!value) return '';
 if (value.length <= maxLength) return value;
 if (maxLength <= 3) return value.slice(0, maxLength);
 const sliceLength = Math.floor((maxLength - 3) / 2);
 return `${value.slice(0, sliceLength)}...${value.slice(-sliceLength)}`;
 }

 // NFT 소유권 조회 함수
 const checkNFTOwnership = async (contractAddress: string, tokenId: string) => {
 if (!walletConnected || !walletAddress) {
 alert('먼저 MetaMask를 연결해주세요.');
 return;
 }

 setLoading(true);
 try {
 // 블록체인에서 직접 NFT 소유권 조회
 const response = await fetch('/api/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
  action: 'check_nft_ownership',
  contractAddress,
  tokenId,
  userAddress: walletAddress
  }),
 });
 
 const ownershipResult = await response.json();
 setNftOwnership(ownershipResult);
 
 // NFT를 소유하고 있다면 자동으로 데이터 접근 테스트 실행
 if (ownershipResult.success && ownershipResult.hasOwnership) {
  await handleAccessTest({
  contractAddress,
  tokenId,
  userAddress: walletAddress
  });
 }
 } catch (error) {
 console.error('NFT 소유권 조회 실패:', error);
 alert('NFT 소유권 조회에 실패했습니다.');
 } finally {
 setLoading(false);
 }
 };

 const handleAccessTest = async (data: any) => {
 setLoading(true);
 try {
 // 사용자가 입력한 실제 텍스트를 포함하여 API 호출
 const requestData = {
  action: 'test_access',
  ...data,
  userTextContent: data.userTextContent || null
 };
 
 const response = await fetch('/api/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestData),
 });
 const responseResult = await response.json();
 console.log(' API 응답 결과:', responseResult);
 setResult(responseResult);
 } catch (error) {
 setResult({ success: false, error: '접근 테스트 실패', message: error instanceof Error ? error.message : 'Unknown error' });
 } finally {
 setLoading(false);
 }
 };

 // 텍스트 콘텐츠 복호화 및 표시 함수
 const decryptAndShowText = async (encryptionData: any, fileName: string) => {
 setDecryptingFile(true);
 try {
 console.log(' 텍스트 복호화 시작:', fileName);
 console.log(' 암호화 데이터:', encryptionData);
 
 if (!encryptionData) {
  throw new Error('암호화 데이터가 없습니다.');
 }

 let decryptedContent = '';

 // Lit Protocol 복호화 우선 시도
 if (encryptionData.encryptionType === 'lit-protocol' || encryptionData.ciphertext) {
  try {
  const { initLitClient, decryptWithLit } = await import('@/lib/lit-protocol');
  const litChain =
  process.env.NEXT_PUBLIC_LIT_CHAIN ||
  (process.env.NEXT_PUBLIC_CHAIN_ID === '1' ? 'ethereum' : 'sepolia');

  await initLitClient();
  
  const litDecrypted = await decryptWithLit(
  encryptionData.ciphertext,
  encryptionData.dataToEncryptHash,
  encryptionData.accessControlConditions,
  litChain || 'sepolia'
  );

  if (litDecrypted) {
  decryptedContent = litDecrypted;
  console.log(' Lit Protocol을 통한 텍스트 복호화 성공');
  }
  } catch (litError) {
  console.warn(' Lit Protocol 텍스트 복호화 실패, Web Crypto 폴백 시도:', litError);
  }
 }

 // Lit 복호화 실패 시 Web Crypto 폴백
 if (!decryptedContent && encryptionData.encryptedFile && encryptionData.encryptedSymmetricKey) {
  const encryptedFileData = new Uint8Array(encryptionData.encryptedFile);
  console.log(' 암호화된 파일 크기:', encryptedFileData.length);

  const symmetricKeyBase64 = encryptionData.encryptedSymmetricKey;
  const symmetricKey = Uint8Array.from(atob(symmetricKeyBase64), c => c.charCodeAt(0));
  console.log(' 대칭 키 복원 완료');

  const decryptedData = await decryptFileWithWebCrypto(encryptedFileData, symmetricKey);
  console.log(' Web Crypto API 복호화 성공, 데이터 길이:', decryptedData.length);
  
  const decoder = new TextDecoder();
  decryptedContent = decoder.decode(decryptedData);
 }

 if (!decryptedContent) {
  throw new Error('복호화된 데이터가 없습니다.');
 }

 console.log(' 복호화 완료! 텍스트:', decryptedContent);
 
 // 결과 업데이트
 if (previewUrlRef.current) {
  URL.revokeObjectURL(previewUrlRef.current);
  previewUrlRef.current = null;
 }

 setResult((prev: any) => ({
  ...prev,
  decryptedContent: decryptedContent,
  decryptedPreview: null,
  success: true,
  message: ' 텍스트 콘텐츠 복호화 성공!'
 }));
 
 } catch (error) {
 console.error(' 텍스트 복호화 실패:', error);
 alert('텍스트 복호화에 실패했습니다: ' + (error instanceof Error ? error.message : 'Unknown error'));
 } finally {
 setDecryptingFile(false);
 }
 };

 useEffect(() => {
 if (
 result &&
 result.success &&
 result.encryptionData &&
 !decryptingFile
 ) {
 const key =
  result.encryptionData.dataToEncryptHash ||
  `${result.contractAddress || ''}-${result.tokenId || ''}-${result.encryptionData.mimeType || ''}`;

 if (autoDecryptedKeyRef.current !== key) {
  autoDecryptedKeyRef.current = key;
  decryptEncryptedFile(result.encryptionData, result.fileName);
 }
 }
 }, [result, decryptingFile]);

 // 암호화된 파일 복호화 및 다운로드 함수
 const decryptEncryptedFile = async (encryptionData: any, fileName: string) => {
 console.log(' 복호화 함수 호출 - encryptionData:', encryptionData);
 console.log(' 복호화 함수 호출 - result:', result);
 
 // result 객체에서 encryptionData 추출
 const actualEncryptionData = encryptionData || result?.encryptionData;
 
 if (!actualEncryptionData) {
 alert('암호화 데이터가 없습니다.');
 return;
 }

 setDecryptingFile(true);
 try {
 console.log(' 복호화 시작 - actualEncryptionData:', actualEncryptionData);
 
 let decryptedTextContent = '';
 let decryptedBytes: Uint8Array | null = null;
 
 // Lit Protocol 암호화 데이터인지 확인
 if (actualEncryptionData.encryptionType === 'lit-protocol' || actualEncryptionData.ciphertext) {
  console.log(' Lit Protocol 복호화 시도...');
  
  try {
  // Lit Protocol 동적 import
  const { initLitClient, decryptWithLit } = await import('@/lib/lit-protocol');
  
  // Lit Protocol 초기화
  await initLitClient();
  
  // Lit Protocol로 복호화
  const litChain =
  process.env.NEXT_PUBLIC_LIT_CHAIN ||
  (process.env.NEXT_PUBLIC_CHAIN_ID === '1' ? 'ethereum' : 'sepolia');

  const result = await decryptWithLit(
  actualEncryptionData.ciphertext,
  actualEncryptionData.dataToEncryptHash,
  actualEncryptionData.accessControlConditions,
  litChain || 'sepolia'
  );
  
  if (result) {
  console.log(' Lit Protocol 복호화 성공');

  const preferredEncoding = actualEncryptionData.encoding || 'utf-8';
  const isBinaryContent =
   preferredEncoding === 'base64' ||
   (actualEncryptionData.mimeType && !actualEncryptionData.mimeType.startsWith('text/'));

  if (isBinaryContent) {
   decryptedBytes = base64ToUint8Array(result);
   console.log(' Lit 복호화 결과 (base64 bytes):', decryptedBytes.length);
  } else {
   decryptedTextContent = result;
   decryptedBytes = new TextEncoder().encode(result);
  }
  } else {
  throw new Error('Lit Protocol 복호화 결과 없음');
  }
  } catch (litError) {
  console.warn(' Lit Protocol 복호화 실패, Web Crypto API로 전환:', litError);
  throw litError; // Web Crypto API 폴백으로 전환
  }
 }
 
 // Web Crypto API 폴백 또는 기본 복호화
 if (
  !decryptedBytes &&
  actualEncryptionData.encryptedFile &&
  actualEncryptionData.encryptedSymmetricKey
 ) {
  console.log(' Web Crypto API 복호화 시도...');
  
  // 암호화된 파일 데이터를 Uint8Array로 변환
  const encryptedFileData = new Uint8Array(actualEncryptionData.encryptedFile);
  console.log(' 암호화된 파일 데이터 길이:', encryptedFileData.length);

  // 대칭 키 복호화 (Base64 디코딩)
  const symmetricKey = new Uint8Array(
  atob(actualEncryptionData.encryptedSymmetricKey).split('').map(char => char.charCodeAt(0))
  );
  console.log(' 대칭 키 길이:', symmetricKey.length);

  // Web Crypto API를 사용한 직접 복호화
  const decryptedData = await decryptFileWithWebCrypto(encryptedFileData, symmetricKey);
  console.log(' Web Crypto API 복호화 성공, 데이터 길이:', decryptedData.length);
  decryptedBytes = decryptedData;

  const preferredEncoding = actualEncryptionData.encoding || 'binary';
  if (preferredEncoding !== 'binary') {
  try {
  const decoder = new TextDecoder();
  decryptedTextContent = decoder.decode(decryptedData);
  } catch (decodeError) {
  console.warn('텍스트 디코딩 실패 (무시):', decodeError);
  }
  }
 }

 // 복호화된 데이터를 미리보기/다운로드용으로 준비
 if (decryptedBytes && decryptedBytes.length > 0) {
  const mimeType =
  actualEncryptionData.mimeType ||
  (actualEncryptionData.encoding === 'utf-8' ? 'text/plain' : 'application/octet-stream');
  const safeFileName =
  fileName ||
  actualEncryptionData.fileMetadata?.name ||
  `decrypted_${Date.now()}`;

  const blob = createDownloadableBlob(decryptedBytes, safeFileName, mimeType);
  const isTextMime = mimeType.startsWith('text/');
  let previewUrl: string | null = null;

  if (!isTextMime) {
  previewUrl = URL.createObjectURL(blob);
  if (previewUrlRef.current) {
  URL.revokeObjectURL(previewUrlRef.current);
  }
  previewUrlRef.current = previewUrl;
  } else if (previewUrlRef.current) {
  URL.revokeObjectURL(previewUrlRef.current);
  previewUrlRef.current = null;
  }

  console.log(' 파일 복호화 완료:', safeFileName);
  if (mimeType.startsWith('text/') && decryptedTextContent) {
  console.log(' 텍스트 미리보기:', decryptedTextContent.slice(0, 120));
  }
  setResult((prev: any) => ({
  ...prev,
  decryptedPreview: previewUrl ? { url: previewUrl, mimeType, fileName: safeFileName, blob } : null,
  decryptedContent: isTextMime ? decryptedTextContent : null,
  }));
 } else {
  throw new Error('복호화된 데이터가 없습니다.');
 }
 } catch (error) {
 console.error(' 파일 복호화 실패:', error);
 alert('파일 복호화에 실패했습니다: ' + (error instanceof Error ? error.message : 'Unknown error'));
 } finally {
 setDecryptingFile(false);
 }
 };

 const downloadDecryptedFile = () => {
 const preview = result?.decryptedPreview;
 const decryptedText = result?.decryptedContent;

 if (preview?.blob) {
 downloadFile(preview.blob, preview.fileName || 'decrypted_file');
 return;
 }

 if (decryptedText) {
 const fileName = result?.fileName || 'decrypted_text.txt';
 const blob = new Blob([decryptedText], { type: 'text/plain' });
 downloadFile(blob, fileName);
 return;
 }

 alert('복호화된 파일이 없습니다. 먼저 복호화를 진행해주세요.');
 };

 // NFT 파기 실제 실행 함수
 const performBurn = useCallback(
 async (nft: any) => {
 if (!walletConnected || !walletAddress) {
  alert('MetaMask를 먼저 연결해주세요.');
  console.warn('[NFT Burn] 지갑 미연결로 파기를 중단합니다.');
  return;
 }

 setBurnStatus({ step: 'validating', message: '지갑 주소 및 네트워크를 확인하는 중입니다.' });
 setBurningNFT(true);

 try {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
  throw new Error('MetaMask가 감지되지 않습니다.');
  }

  const ethereum = (window as any).ethereum;
  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  console.log('[NFT Burn] provider/signer 준비 완료', {
  signerAddress: await signer.getAddress(),
  });
  const signerAddress = (await signer.getAddress()).toLowerCase();
  const expectedAddress = walletAddress.toLowerCase();

  if (signerAddress !== expectedAddress) {
  throw new Error(`연결된 지갑 주소(${signerAddress})와 화면에 표시된 주소(${expectedAddress})가 일치하지 않습니다.`);
  }

  const network = await provider.getNetwork();
  const expectedChainId = BigInt(process.env.NEXT_PUBLIC_CHAIN_ID || '11155111');
  if (network.chainId !== expectedChainId) {
  const expectedChainIdHex = `0x${expectedChainId.toString(16)}`;
  try {
  console.warn('[NFT Burn] 네트워크 전환 시도', {
   current: network.chainId.toString(),
   expected: expectedChainId.toString(),
  });
  await ethereum.request?.({
   method: 'wallet_switchEthereumChain',
   params: [{ chainId: expectedChainIdHex }],
  });
  const refreshedProvider = new BrowserProvider(ethereum);
  const refreshedNetwork = await refreshedProvider.getNetwork();
  if (refreshedNetwork.chainId !== expectedChainId) {
   throw new Error();
  }
  console.log('[NFT Burn] 네트워크 전환 성공');
  } catch (switchError) {
  throw new Error('Sepolia 네트워크로 전환한 뒤 다시 시도해주세요.');
  }
  }

  setBurnStatus({ step: 'signing', message: 'MetaMask에서 파기 트랜잭션 서명 요청을 확인해주세요.' });

  const contract = new Contract(
  nft.contractAddress,
  [
  'function burn(address from, uint256 id, uint256 amount) external',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  ],
  signer
  );

  const balance = await contract.balanceOf(walletAddress, nft.tokenId);
  const balanceBigInt = typeof balance === 'bigint' ? balance : BigInt(balance?.toString?.() ?? '0');
  if (balanceBigInt < 1n) {
  throw new Error('NFT를 소유하고 있지 않습니다.');
  }

  const gasEstimate = await contract.burn.estimateGas(walletAddress, nft.tokenId, 1);
  const bufferedGas = gasEstimate + (gasEstimate / 10n) + 10_000n;

  const tx = await contract.burn(walletAddress, nft.tokenId, 1, {
  gasLimit: bufferedGas,
  });

  console.log('[NFT Burn] 파기 트랜잭션 전송', {
  hash: tx.hash,
  gasLimit: bufferedGas.toString(),
  });
  setBurnStatus({
  step: 'pending',
  message: `트랜잭션이 확정될 때까지 기다리는 중입니다. (가스 한도: ${bufferedGas.toString()})`,
  txHash: tx.hash,
  });

  await tx.wait();

  try {
  const metadataKey = `${nft.contractAddress.toLowerCase()}_${nft.tokenId}`;
  localStorage.removeItem(metadataKey);
  } catch (storageError) {
  console.warn('localStorage 삭제 실패:', storageError);
  }

  setBurnStatus({
  step: 'success',
  message: 'NFT 파기가 성공적으로 완료되었습니다.',
  txHash: tx.hash,
  });

  await fetchUserNFTs(walletAddress);
  setResult(null);
  setNftOwnership(null);
 } catch (error) {
  console.error('[NFT Burn] 실패', error);
  const message =
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  setBurnStatus({
  step: 'error',
  message,
  });
  alert(`NFT 파기에 실패했습니다: ${message}`);
 } finally {
  setBurningNFT(false);
  console.log('[NFT Burn] 파기 프로세스 종료');
 }
 },
 [walletConnected, walletAddress, fetchUserNFTs]
 );

 const openBurnConfirm = useCallback(
 (nft: any) => {
 if (!walletConnected || !walletAddress) {
  alert('MetaMask를 먼저 연결해주세요.');
  return;
 }
 console.log(' 파기 버튼 클릭:', {
  tokenId: nft?.tokenId,
  contractAddress: nft?.contractAddress,
  walletAddress,
 });
 setConfirmBurnTarget(nft);
 setShowBurnConfirm(true);
 setBurnStatus({ step: 'idle' });
 },
 [walletConnected, walletAddress]
 );

 const closeBurnConfirm = useCallback(() => {
 setShowBurnConfirm(false);
 setConfirmBurnTarget(null);
 setBurnStatus({ step: 'idle' });
 console.log('[NFT Burn] 사용자 요청으로 파기 확인 창을 닫았습니다.');
 }, []);

 const confirmBurnAndExecute = useCallback(async () => {
 if (!confirmBurnTarget) {
 return;
 }
 setShowBurnConfirm(false);
 console.log('[NFT Burn] 파기 확정 - 실행 시작', {
 tokenId: confirmBurnTarget.tokenId,
 contractAddress: confirmBurnTarget.contractAddress,
 });
 await performBurn(confirmBurnTarget);
 setConfirmBurnTarget(null);
 }, [confirmBurnTarget, performBurn]);

 return (
 <>
 <style dangerouslySetInnerHTML={{
  __html: `
  @keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
  }
  .hover-button:hover {
  background-color: #d97706 !important;
  }
  .hover-nft-card:hover {
  border-color: #3b82f6 !important;
  }
  `
 }} />
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
   color: '#6b7280', 
   textDecoration: 'none',
   fontWeight: '500',
   fontSize: 'clamp(14px, 3vw, 16px)'
  }}>
   NFT 생성
  </Link>
  <Link href="/access" style={{ 
   color: '#3b82f6', 
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
  NFT를 이용한 데이터 접근
  </h1>

  {showBurnConfirm && confirmBurnTarget && (
  <div
  style={{
   position: 'fixed',
   top: 0,
   left: 0,
   width: '100%',
   height: '100%',
   backgroundColor: 'rgba(15, 23, 42, 0.45)',
   display: 'flex',
   alignItems: 'center',
   justifyContent: 'center',
   zIndex: 9999,
   padding: '16px',
  }}
  onClick={closeBurnConfirm}
  >
  <div
   onClick={(e) => e.stopPropagation()}
   style={{
   width: 'min(420px, 95%)',
   maxWidth: '100%',
   backgroundColor: '#ffffff',
   borderRadius: '14px',
   border: '1px solid #e2e8f0',
   boxShadow: '0 20px 45px rgba(15, 23, 42, 0.3)',
   padding: 'clamp(16px, 4vw, 24px)',
   display: 'flex',
   flexDirection: 'column',
   gap: 'clamp(12px, 3vw, 16px)',
   boxSizing: 'border-box',
   overflow: 'hidden'
   }}
  >
   <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
   <span style={{ fontSize: '24px' }}></span>
   <h3 style={{ margin: 0, fontSize: 'clamp(1rem, 3vw, 1.25rem)', color: '#1f2937' }}>파기 확인</h3>
   </div>
   <p style={{ margin: 0, color: '#4b5563', fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)', lineHeight: 1.5, wordBreak: 'break-word' }}>
   <strong style={{ display: 'block', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
   {shortenDisplayText(confirmBurnTarget.name, 30)}
   </strong>
   <span style={{ fontSize: 'clamp(0.75rem, 2vw, 0.85rem)', color: '#6b7280', display: 'block', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
   #{shortenDisplayText(confirmBurnTarget.tokenId, 10)}
   </span>
   NFT를 영구적으로 파기하시겠습니까?
   </p>
   <div
   style={{
   backgroundColor: '#fef2f2',
   border: '1px solid #fecaca',
   borderRadius: '10px',
   padding: 'clamp(10px, 2.5vw, 12px)',
   color: '#b91c1c',
   fontSize: 'clamp(0.75rem, 2vw, 0.85rem)',
   lineHeight: 1.4,
   wordBreak: 'keep-all'
   }}
   >
    파기는 되돌릴 수 없으며, 가스비가 발생합니다.
   </div>
   <div style={{ display: 'flex', gap: 'clamp(8px, 2vw, 12px)', width: '100%' }}>
   <button
   onClick={closeBurnConfirm}
   style={{
    flex: 1,
    padding: 'clamp(10px, 2.5vw, 12px)',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    backgroundColor: '#fff',
    color: '#374151',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
    minHeight: '44px'
   }}
   >
   취소
   </button>
   <button
   onClick={confirmBurnAndExecute}
   disabled={burningNFT}
   style={{
    flex: 1,
    padding: 'clamp(10px, 2.5vw, 12px)',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: burningNFT ? '#9ca3af' : '#ef4444',
    color: '#fff',
    fontWeight: 600,
    cursor: burningNFT ? 'not-allowed' : 'pointer',
    fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
    minHeight: '44px'
   }}
   >
   {burningNFT ? '처리중' : '파기'}
   </button>
   </div>
  </div>
  </div>
  )}

  {/* 통합된 MetaMask 연결 및 NFT 조회 섹션 */}
  <div style={{ 
  backgroundColor: 'white',
  borderRadius: '16px',
  padding: 'clamp(24px, 4vw, 32px)',
  border: '1px solid #e5e7eb',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  marginBottom: '24px',
  width: '100%',
  boxSizing: 'border-box'
  }}>
  <h3 style={{ 
  fontSize: '1.5rem',
  fontWeight: 'bold',
  color: '#1f2937',
  marginBottom: '24px',
  textAlign: 'center',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px'
  }}>
   MetaMask 연결 & NFT 조회
  </h3>

  {!walletConnected ? (
  <div style={{ textAlign: 'center' }}>
   <div style={{ fontSize: '3rem', marginBottom: '16px' }}></div>
   <p style={{ 
   color: '#6b7280',
   fontSize: '1rem',
   marginBottom: '20px'
   }}>
   NFT 소유권을 확인하고 데이터에 접근하기 위해 MetaMask를 연결해주세요
   </p>
   <button
   onClick={connectWallet}
   className="hover-button"
   style={{
   padding: '14px 28px',
   backgroundColor: '#f59e0b',
   color: 'white',
   border: 'none',
   borderRadius: '10px',
   fontSize: '1.1rem',
   fontWeight: '600',
   cursor: 'pointer',
   transition: 'background-color 0.2s',
   boxShadow: '0 2px 4px rgba(245, 158, 11, 0.3)'
   }}
   >
   MetaMask 연결하기
   </button>
  </div>
  ) : (
  <div>
   {/* 지갑 연결 상태 */}
   <div style={{ 
   backgroundColor: '#f0f9ff',
   padding: 'clamp(14px, 3.5vw, 20px)',
   borderRadius: '12px',
   border: '1px solid #0ea5e9',
   marginBottom: 'clamp(16px, 4vw, 24px)',
   width: '100%',
   boxSizing: 'border-box'
   }}>
   <div style={{ marginBottom: 'clamp(12px, 3vw, 16px)' }}>
   <p style={{ 
    color: '#0369a1',
    fontWeight: '600',
    marginBottom: '6px',
    fontSize: 'clamp(0.875rem, 2.5vw, 1rem)'
   }}>
    연결됨
   </p>
   <p style={{ 
    color: '#0369a1',
    fontSize: 'clamp(0.7rem, 2vw, 0.75rem)',
    fontFamily: 'monospace',
    marginBottom: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
   }}>
    {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
   </p>
   </div>
   <button 
   onClick={() => fetchUserNFTs(walletAddress)}
   disabled={loadingNFTs}
   style={{
    width: '100%',
    padding: 'clamp(10px, 2.5vw, 12px)',
    backgroundColor: loadingNFTs ? '#9ca3af' : '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
    fontWeight: '600',
    cursor: loadingNFTs ? 'not-allowed' : 'pointer',
    transition: 'background-color 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: loadingNFTs ? 'none' : '0 2px 4px rgba(16, 185, 129, 0.3)',
    minHeight: '44px'
   }}
   >
   {loadingNFTs ? (
    <>
    <div style={{
    width: '14px',
    height: '14px',
    border: '2px solid #e5e7eb',
    borderTop: '2px solid #ffffff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
    }}></div>
    조회중
    </>
   ) : (
    ' NFT 조회'
   )}
   </button>
   <p style={{ 
   color: '#0369a1',
   fontSize: '0.875rem',
   textAlign: 'center',
   margin: '0'
   }}>
   연결 즉시 NFT 목록이 자동으로 조회됩니다
   </p>
   </div>

  {burnStatus.step !== 'idle' && (
   <div
   style={{
   marginBottom: '16px',
   padding: '12px 16px',
   borderRadius: '10px',
   border:
    burnStatus.step === 'success'
    ? '1px solid #22c55e'
    : burnStatus.step === 'error'
    ? '1px solid #f87171'
    : '1px solid #60a5fa',
   backgroundColor:
    burnStatus.step === 'success'
    ? '#dcfce7'
    : burnStatus.step === 'error'
    ? '#fef2f2'
    : '#eff6ff',
   color:
    burnStatus.step === 'success'
    ? '#166534'
    : burnStatus.step === 'error'
    ? '#991b1b'
    : '#1d4ed8',
   fontSize: '0.9rem',
   display: 'flex',
   flexDirection: 'column',
   gap: '6px',
   }}
   >
   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
   <strong style={{ fontSize: '0.95rem' }}>
    {burnStatus.step === 'success'
    ? ' 파기 완료'
    : burnStatus.step === 'error'
    ? ' 파기 실패'
    : burnStatus.step === 'pending'
     ? ' 트랜잭션 진행 중'
     : burnStatus.step === 'signing'
     ? ' 서명 대기 중'
     : ' 파기 준비 중'}
   </strong>
   <button
    onClick={() => setBurnStatus({ step: 'idle' })}
    style={{
    border: 'none',
    background: 'transparent',
    color:
    burnStatus.step === 'error'
     ? '#b91c1c'
     : burnStatus.step === 'success'
     ? '#15803d'
     : '#1d4ed8',
    fontSize: '0.8rem',
    cursor: 'pointer',
    }}
   >
    닫기
   </button>
   </div>
   {burnStatus.message && (
   <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
    {burnStatus.message}
   </span>
   )}
   {burnStatus.txHash && (
   <a
    href={`https://sepolia.etherscan.io/tx/${burnStatus.txHash}`}
    target="_blank"
    rel="noreferrer"
    style={{
    color:
    burnStatus.step === 'error'
     ? '#b91c1c'
     : burnStatus.step === 'success'
     ? '#047857'
     : '#2563eb',
    fontSize: '0.8rem',
    textDecoration: 'underline',
    wordBreak: 'break-all',
    }}
   >
    Etherscan에서 트랜잭션 확인
   </a>
   )}
   </div>
  )}

   {/* NFT 목록 표시 */}
   {userNFTs.length > 0 && (
   <div style={{ 
   backgroundColor: '#f8fafc', 
   padding: '20px', 
   borderRadius: '12px',
   border: '1px solid #e5e7eb'
   }}>
   <h4 style={{ 
    fontSize: '1.125rem', 
    fontWeight: '600', 
    color: '#1f2937',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
   }}>
    소유한 NFT 
    <span style={{ 
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '0.875rem',
    fontWeight: '500'
    }}>
    {userNFTs.length}개
    </span>
   </h4>
   
   <div style={{ display: 'grid', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
    {userNFTs.map((nft, index) => {
    const displayName = shortenDisplayText(nft.name, 18);
    const displayTokenId = shortenDisplayText(nft.tokenId, 8);

    return (
    <div
     key={index}
     className={loading ? '' : 'hover-nft-card'}
     style={{
     padding: 'clamp(12px, 3vw, 16px)',
     backgroundColor: 'white',
     borderRadius: '8px',
     border: '1px solid #e5e7eb',
     transition: 'all 0.2s',
     opacity: loading ? 0.6 : 1,
     boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
     width: '100%',
     boxSizing: 'border-box'
     }}
    >
     {/* 상단: 이미지 + 정보 */}
     <div style={{ display: 'flex', gap: 'clamp(10px, 2.5vw, 16px)', alignItems: 'center', marginBottom: 'clamp(10px, 2.5vw, 12px)', width: '100%' }}>
     {nft.coverImageUrl && (
     <img 
      src={nft.coverImageUrl} 
      alt={nft.name}
      style={{
      width: 'clamp(60px, 15vw, 80px)',
      height: 'clamp(60px, 15vw, 80px)',
      objectFit: 'cover',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
      flexShrink: 0
      }}
     />
     )}
     
     <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
     <h5 style={{ 
      fontWeight: '600', 
      color: '#1f2937', 
      margin: '0 0 4px 0',
      fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
      lineHeight: '1.3',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
     }}>
      {displayName} {nft.hasEncryption && ''}
     </h5>
     <p style={{ 
      fontSize: 'clamp(0.7rem, 2vw, 0.75rem)', 
      color: '#6b7280', 
      margin: '0 0 4px 0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
     }}>
      #{displayTokenId}
     </p>
     <p style={{ 
      fontSize: 'clamp(0.7rem, 2vw, 0.75rem)', 
      color: '#9ca3af', 
      margin: '0'
     }}>
      잔액: {nft.balance}개
     </p>
     </div>
     </div>
     
     {/* 하단: 버튼 */}
     <div style={{ display: 'flex', gap: 'clamp(6px, 1.5vw, 8px)', width: '100%' }}>
     <button
      onClick={(e) => {
      e.stopPropagation();
      selectNFT(nft);
      }}
      disabled={loading || burningNFT}
      style={{
      flex: 1,
      backgroundColor: loading || burningNFT ? '#9ca3af' : '#10b981',
      color: 'white',
      padding: 'clamp(8px, 2vw, 10px) 0',
      borderRadius: '6px',
      fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)',
      fontWeight: '600',
      border: 'none',
      cursor: loading || burningNFT ? 'not-allowed' : 'pointer',
      transition: 'background-color 0.2s',
      boxShadow: loading || burningNFT ? 'none' : '0 2px 4px rgba(16, 185, 129, 0.3)',
      whiteSpace: 'nowrap',
      minHeight: '40px'
      }}
     >
      접근
     </button>
     <button
      onClick={(e) => {
      e.stopPropagation();
      openBurnConfirm(nft);
      }}
      disabled={burningNFT}
      style={{
      flex: 1,
      backgroundColor: burningNFT ? '#9ca3af' : '#ef4444',
      color: 'white',
      padding: 'clamp(8px, 2vw, 10px) 0',
      borderRadius: '6px',
      fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)',
      fontWeight: '600',
      border: 'none',
      cursor: burningNFT ? 'not-allowed' : 'pointer',
      transition: 'background-color 0.2s',
      boxShadow: burningNFT ? 'none' : '0 2px 4px rgba(239, 68, 68, 0.3)',
      whiteSpace: 'nowrap',
      minHeight: '40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px'
      }}
     >
     {burningNFT ? (
      <>
      <div style={{
      width: '12px',
      height: '12px',
      border: '2px solid #e5e7eb',
      borderTop: '2px solid #ffffff',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
      }}></div>
      처리중
      </>
     ) : (
      '파기'
     )}
     </button>
     </div>
    </div>
    );
    })}
   </div>
   </div>
   )}

   {userNFTs.length === 0 && !loadingNFTs && (
   <div style={{ 
   backgroundColor: '#f8fafc', 
   padding: '32px', 
   borderRadius: '12px',
   border: '1px solid #e5e7eb',
   textAlign: 'center'
   }}>
   <div style={{ fontSize: '2rem', marginBottom: '12px' }}></div>
   <p style={{ 
    color: '#6b7280', 
    fontSize: '1rem',
    marginBottom: '16px'
   }}>
    소유한 NFT가 없습니다
   </p>
   <p style={{ 
    color: '#9ca3af', 
    fontSize: '0.875rem',
    marginBottom: '20px'
   }}>
    NFT를 생성하여 암호화된 데이터에 접근할 수 있습니다
   </p>
   <Link href="/create" style={{
    display: 'inline-block',
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '12px 24px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '0.875rem',
    fontWeight: '600',
    boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)'
   }}>
    NFT 생성하기
   </Link>
   </div>
   )}
  </div>
  )}
  </div>


  {/* NFT 소유권 결과 */}
  {nftOwnership && (
  <div style={{ 
  backgroundColor: 'white',
  borderRadius: '16px',
  padding: '24px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  marginBottom: '24px'
  }}>
  <h4 style={{ 
   fontSize: '1.25rem',
   fontWeight: 'bold',
   color: '#1f2937',
   marginBottom: '16px'
  }}>
   NFT 소유권 조회 결과
  </h4>
  
  <div style={{ 
   backgroundColor: nftOwnership.success && nftOwnership.hasOwnership ? '#f0f9ff' : '#fef2f2',
   padding: '16px',
   borderRadius: '8px',
   border: `1px solid ${nftOwnership.success && nftOwnership.hasOwnership ? '#0ea5e9' : '#ef4444'}`
  }}>
   <p style={{ 
   color: nftOwnership.success && nftOwnership.hasOwnership ? '#0369a1' : '#dc2626',
   fontWeight: '600',
   marginBottom: '8px'
   }}>
   {nftOwnership.success && nftOwnership.hasOwnership ? ' NFT 소유권 확인됨' : ' NFT를 소유하고 있지 않음'}
   </p>
   
   {nftOwnership.success && nftOwnership.hasOwnership && (
   <p style={{ 
   color: '#0369a1',
   fontSize: '0.875rem'
   }}>
   자동으로 데이터 접근을 시도합니다...
   </p>
   )}
   
   {!nftOwnership.success && (
   <p style={{ 
   color: '#dc2626',
   fontSize: '0.875rem'
   }}>
   {nftOwnership.message || 'NFT 소유권 확인에 실패했습니다.'}
   </p>
   )}
  </div>
  </div>
  )}

  {/* 데이터 접근 결과 */}
  {result && (
  <div style={{ 
  backgroundColor: 'white',
  borderRadius: '16px',
  padding: '24px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
  }}>
  <h4 style={{ 
   fontSize: '1.25rem',
   fontWeight: 'bold',
   color: '#1f2937',
   marginBottom: '16px'
  }}>
   데이터 접근 결과
  </h4>
  
  <div style={{ 
   backgroundColor: result.success ? '#f0f9ff' : '#fef2f2',
   padding: '16px',
   borderRadius: '8px',
   border: `1px solid ${result.success ? '#0ea5e9' : '#ef4444'}`
  }}>
   {result.success ? (
   <div>
   <p style={{ 
    color: '#0369a1',
    fontWeight: '600',
    marginBottom: '12px'
   }}>
    접근 성공! 암호화된 데이터에 접근할 수 있습니다.
   </p>
   
   {/* 암호화된 파일 다운로드 섹션 */}
   {result.encryptionData && (() => {
    const contentInfo = classifyContentType(
    result?.encryptionData?.mimeType ||
    result?.metadata?.properties?.mimeType ||
    result?.metadata?.mimeType
    );
    const previewUrl = resolvePreviewUrl(result, contentInfo.variant);
    const fileDisplayName =
    result.fileName ||
    result.encryptionData?.fileMetadata?.name ||
    'encrypted_file';
    const rawMimeLabel =
    result.encryptionData?.mimeType ||
    result.metadata?.properties?.mimeType ||
    'application/octet-stream';
    const displayFileName = shortenDisplayText(fileDisplayName, 48);
    const mimeLabel = rawMimeLabel;
    const displayMimeLabel = shortenDisplayText(mimeLabel, 48);
    const sizeLabel = formatBytes(result.encryptionData?.fileMetadata?.size);
    const decryptedPreview = result.decryptedPreview;
    const decryptedText = result.decryptedContent;
    const livePreviewInfo = decryptedPreview
    ? classifyContentType(decryptedPreview.mimeType)
    : null;

    return (
    <div style={{
    backgroundColor: '#f8fafc',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    marginBottom: '16px'
    }}>
    <div style={{
     display: 'flex',
     alignItems: 'center',
     justifyContent: 'space-between',
     marginBottom: '12px'
    }}>
    <div style={{ display: 'flex', alignItems: 'stretch', gap: '12px' }}>
     <div style={{
     width: '56px',
     height: '56px',
     borderRadius: '12px',
     overflow: 'hidden',
     backgroundColor: '#e2e8f0',
     display: 'flex',
     alignItems: 'center',
     justifyContent: 'center',
     position: 'relative'
     }}>
     {previewUrl ? (
      <>
      <img
      src={previewUrl}
      alt={`${contentInfo.label} 미리보기`}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {contentInfo.variant === 'video' && (
      <span style={{
       position: 'absolute',
       bottom: '4px',
       right: '4px',
       fontSize: '1rem',
       backgroundColor: 'rgba(15, 23, 42, 0.65)',
       color: '#ffffff',
       borderRadius: '999px',
       padding: '2px 6px'
      }}>
       {contentInfo.icon}
      </span>
      )}
      </>
     ) : (
      <span style={{ fontSize: '1.5rem' }}>{contentInfo.icon}</span>
     )}
     </div>
     <div style={{ flex: 1, minWidth: 0 }}>
     <p style={{
     fontWeight: '600',
     color: '#1f2937',
     margin: '0 0 4px 0',
     fontSize: '0.95rem',
     overflow: 'hidden',
     textOverflow: 'ellipsis',
     whiteSpace: 'nowrap'
     }}>
     {displayFileName}
     </p>
     <p style={{ 
     color: '#6b7280', 
     margin: '0', 
     fontSize: '0.75rem',
     overflow: 'hidden',
     textOverflow: 'ellipsis',
     whiteSpace: 'nowrap'
     }}>
     {contentInfo.label} · {displayMimeLabel}{sizeLabel ? ` · ${sizeLabel}` : ''}
     </p>
     <p style={{ color: '#94a3b8', margin: '4px 0 0 0', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
     토큰: {shortenDisplayText(result.tokenId?.toString(), 32)} · 크기: {sizeLabel || '알 수 없음'}
     </p>
     </div>
     </div>
     <button
     onClick={downloadDecryptedFile}
     disabled={decryptingFile || (!decryptedPreview && !decryptedText)}
     style={{
     padding: '8px 16px',
     backgroundColor: decryptingFile || (!decryptedPreview && !decryptedText) ? '#9ca3af' : '#10b981',
     color: 'white',
     border: 'none',
     borderRadius: '6px',
     fontSize: '0.875rem',
     fontWeight: '600',
     cursor: decryptingFile || (!decryptedPreview && !decryptedText) ? 'not-allowed' : 'pointer',
     transition: 'background-color 0.2s',
     display: 'flex',
     alignItems: 'center',
     gap: '6px',
     boxShadow: decryptingFile || (!decryptedPreview && !decryptedText) ? 'none' : '0 2px 4px rgba(16, 185, 129, 0.3)'
     }}
     >
     {decryptingFile ? (
     <>
      <div style={{
      width: '12px',
      height: '12px',
      border: '2px solid #e5e7eb',
      borderTop: '2px solid #ffffff',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
      }}></div>
      복호화 중...
     </>
     ) : (
     <>
      복호화된 파일 다운로드
     </>
     )}
     </button>
    </div>
    <p style={{
     color: '#6b7280',
     fontSize: '0.75rem',
     margin: '0',
     lineHeight: '1.4'
    }}>
     {`${contentInfo.label} 콘텐츠가 암호화되어 저장되었습니다.`}
    </p>

    {decryptedPreview && livePreviewInfo && (
     <div style={{ marginTop: '16px' }}>
     <p style={{ color: '#0f172a', fontWeight: 600, marginBottom: '8px' }}>
     {livePreviewInfo.variant === 'video'
      ? ' 복호화된 영상 미리보기'
      : livePreviewInfo.variant === 'image'
      ? ' 복호화된 이미지 미리보기'
      : livePreviewInfo.variant === 'audio'
      ? ' 복호화된 오디오 미리보기'
      : livePreviewInfo.variant === 'pdf'
      ? ' 복호화된 문서 미리보기'
      : ' 복호화된 파일 미리보기'}
     </p>
     {livePreviewInfo.variant === 'image' && (
     <img
      src={decryptedPreview.url}
      alt="복호화된 이미지"
      style={{
      maxWidth: '100%',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      }}
     />
     )}
     {livePreviewInfo.variant === 'video' && (
     <video
      src={decryptedPreview.url}
      controls
      style={{
      width: '100%',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      backgroundColor: '#000',
      }}
     />
     )}
     {livePreviewInfo.variant === 'audio' && (
     <audio src={decryptedPreview.url} controls style={{ width: '100%' }} />
     )}
     {livePreviewInfo.variant === 'pdf' && (
     <iframe
      src={decryptedPreview.url}
      title="PDF 미리보기"
      style={{
      width: '100%',
      minHeight: '480px',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      backgroundColor: '#fff',
      }}
     />
     )}
     {livePreviewInfo.variant === 'default' && (
     <p style={{ color: '#475569', fontSize: '0.875rem' }}>
      복호화된 파일은 위 다운로드 버튼을 통해 확인해주세요.
     </p>
     )}
     </div>
    )}

    {!decryptedPreview && decryptedText && (
     <div style={{
     backgroundColor: '#1f2937',
     color: '#f9fafb',
     padding: '16px',
     borderRadius: '8px',
     fontFamily: 'monospace',
     fontSize: '0.875rem',
     marginTop: '12px',
     whiteSpace: 'pre-wrap',
     wordBreak: 'break-word',
     }}>
     <strong>복호화된 텍스트:</strong><br />
     {decryptedText}
     </div>
    )}

    {!decryptedPreview && !decryptedText && (
     <p style={{ marginTop: '12px', color: '#475569', fontSize: '0.875rem' }}>
     복호화된 파일은 위 다운로드 버튼을 통해 확인해주세요.
     </p>
    )}

    </div>
    );
   })()}
   </div>
   ) : (
   <div>
   <p style={{ 
    color: '#dc2626',
    fontWeight: '600',
    marginBottom: '8px'
   }}>
    접근 실패
   </p>
   <p style={{ 
    color: '#dc2626',
    fontSize: '0.875rem'
   }}>
    {result.message || result.error}
   </p>
   </div>
   )}
  </div>
  </div>
  )}

 </div>
 </div>
 </>
 );
}