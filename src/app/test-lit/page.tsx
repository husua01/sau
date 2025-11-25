"use client";

import { useState } from 'react';
import { 
 initLitClient, 
 encryptWithLit, 
 decryptWithLit, 
 createAccessControlConditions 
} from '@/lib/lit-protocol';

/**
 * Lit Protocol 테스트 페이지
 * 
 * 이 페이지는 Lit Protocol의 암호화/복호화 기능을 테스트합니다.
 * 실제 NFT 소유 여부를 확인하므로, 테스트 NFT를 먼저 생성해야 합니다.
 */
export default function TestLitPage() {
 const [status, setStatus] = useState('');
 const [secretMessage, setSecretMessage] = useState('이 메시지는 NFT 홀더만 볼 수 있습니다. ');
 const [contractAddress, setContractAddress] = useState('');
 const [tokenId, setTokenId] = useState('1');
 const [chain, setChain] = useState('sepolia');
 
 // 암호화 결과
 const [encryptedData, setEncryptedData] = useState<{
 ciphertext: string;
 dataToEncryptHash: string;
 accessControlConditions: any[];
 } | null>(null);
 
 // 복호화 결과
 const [decryptedMessage, setDecryptedMessage] = useState('');

 const handleInitLit = async () => {
 try {
 setStatus(' Lit 클라이언트 초기화 중... (브라우저 콘솔을 확인하세요)');
 
 const client = await initLitClient();
 
 if (client) {
  setStatus(' Lit 클라이언트 초기화 성공! 브라우저 콘솔에서 상세 로그를 확인하세요.');
 } else {
  setStatus(' Lit 클라이언트 초기화 실패. 브라우저 콘솔(F12)에서 상세 에러를 확인하세요.');
 }
 } catch (error: any) {
 const errorMsg = error?.message || String(error);
 setStatus(` 오류: ${errorMsg}\n\n브라우저 콘솔(F12)에서 상세 정보를 확인하세요.`);
 }
 };

 const handleEncrypt = async () => {
 if (!contractAddress || !tokenId) {
 setStatus(' 컨트랙트 주소와 토큰 ID를 입력하세요.');
 return;
 }

 try {
 setStatus(' 데이터 암호화 중... (브라우저 콘솔을 확인하세요)');
 
 // 1. Lit 클라이언트 초기화
 await initLitClient();
 
 // 2. 접근 제어 조건 생성
 const accessControlConditions = createAccessControlConditions(
  contractAddress,
  tokenId,
  chain
 );
 
 
 // 3. 데이터 암호화
 const result = await encryptWithLit(secretMessage, accessControlConditions);
 
 if (result) {
  setEncryptedData({
  ciphertext: result.ciphertext,
  dataToEncryptHash: result.dataToEncryptHash,
  accessControlConditions
  });
  setStatus(' 암호화 성공! 이제 복호화를 시도해보세요.');
 } else {
  setStatus(' 암호화 실패: 결과가 없습니다. 브라우저 콘솔을 확인하세요.');
 }
 } catch (error: any) {
 const errorMsg = error?.message || String(error);
 setStatus(` 암호화 오류: ${errorMsg}\n\n브라우저 콘솔(F12)에서 상세 정보를 확인하세요.`);
 }
 };

 const handleDecrypt = async () => {
 if (!encryptedData) {
 setStatus(' 먼저 데이터를 암호화하세요.');
 return;
 }

 try {
 setStatus(' 데이터 복호화 중... (MetaMask 서명이 필요합니다)');
 
 // 1. Lit 클라이언트 초기화
 await initLitClient();
 
 // 2. 데이터 복호화 (MetaMask 서명 팝업이 나타남)
 const result = await decryptWithLit(
  encryptedData.ciphertext,
  encryptedData.dataToEncryptHash,
  encryptedData.accessControlConditions,
  chain
 );
 
 if (result) {
  setDecryptedMessage(result);
  setStatus(' 복호화 성공! 아래에서 복호화된 메시지를 확인하세요.');
 } else {
  setStatus(' 복호화 실패: 결과가 없습니다. 브라우저 콘솔을 확인하세요.');
 }
 } catch (error: any) {
 const errorMsg = error?.message || String(error);
 setStatus(` 복호화 오류: ${errorMsg}\n\n브라우저 콘솔(F12)에서 상세 정보를 확인하세요.`);
 
 
 }
 };

 const handleCopyEncryptedData = () => {
 if (encryptedData) {
 navigator.clipboard.writeText(JSON.stringify(encryptedData, null, 2));
 alert('암호화된 데이터가 클립보드에 복사되었습니다!');
 }
 };

 return (
 <div style={{ 
 maxWidth: '800px', 
 margin: '40px auto', 
 padding: '20px',
 fontFamily: 'system-ui, sans-serif'
 }}>
 <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>
  Lit Protocol 테스트
 </h1>
 <p style={{ color: '#666', marginBottom: '30px' }}>
  Lit Protocol v3 SDK를 사용한 NFT 기반 접근 제어 테스트
 </p>

 {/* 상태 표시 */}
 {status && (
  <div style={{
  padding: '15px',
  backgroundColor: status.includes('') ? '#d4edda' : 
     status.includes('') ? '#f8d7da' : '#d1ecf1',
  color: status.includes('') ? '#155724' : 
    status.includes('') ? '#721c24' : '#0c5460',
  borderRadius: '8px',
  marginBottom: '20px',
  fontSize: '14px',
  whiteSpace: 'pre-wrap',
  lineHeight: '1.6'
  }}>
  {status}
  </div>
 )}

 {/* 브라우저 콘솔 안내 */}
 <div style={{
  padding: '12px',
  backgroundColor: '#fff3cd',
  color: '#856404',
  borderRadius: '8px',
  marginBottom: '20px',
  fontSize: '13px',
  border: '1px solid #ffeaa7'
 }}>
  <strong>디버깅 팁:</strong> 브라우저 개발자 도구(F12 또는 Cmd+Option+I)를 열어 상세한 로그를 확인하세요.
  <br />
  <span style={{ fontSize: '12px', opacity: 0.8 }}>
  모든 Lit Protocol 동작은 콘솔에 단계별로 기록됩니다.
  </span>
 </div>

 {/* Lit 클라이언트 초기화 */}
 <div style={{ marginBottom: '30px' }}>
  <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>1. Lit 클라이언트 초기화</h2>
  <button 
  onClick={handleInitLit}
  style={{
  padding: '12px 24px',
  backgroundColor: '#6366f1',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500'
  }}
  >
   Lit 클라이언트 초기화
  </button>
  <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
  Lit Protocol 네트워크에 연결합니다.
  </p>
 </div>

 {/* 암호화 섹션 */}
 <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
  <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>2. 데이터 암호화</h2>
  
  <div style={{ marginBottom: '15px' }}>
  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
  비밀 메시지:
  </label>
  <textarea
  value={secretMessage}
  onChange={(e) => setSecretMessage(e.target.value)}
  style={{
   width: '100%',
   padding: '10px',
   borderRadius: '6px',
   border: '1px solid #ddd',
   fontSize: '14px',
   fontFamily: 'inherit',
   minHeight: '80px'
  }}
  />
  </div>

  <div style={{ marginBottom: '15px' }}>
  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
  NFT 컨트랙트 주소:
  </label>
  <input
  type="text"
  value={contractAddress}
  onChange={(e) => setContractAddress(e.target.value)}
  placeholder="0x..."
  style={{
   width: '100%',
   padding: '10px',
   borderRadius: '6px',
   border: '1px solid #ddd',
   fontSize: '14px'
  }}
  />
  </div>

  <div style={{ marginBottom: '15px' }}>
  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
  토큰 ID:
  </label>
  <input
  type="text"
  value={tokenId}
  onChange={(e) => setTokenId(e.target.value)}
  placeholder="1"
  style={{
   width: '100%',
   padding: '10px',
   borderRadius: '6px',
   border: '1px solid #ddd',
   fontSize: '14px'
  }}
  />
  </div>

  <div style={{ marginBottom: '15px' }}>
  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
  체인:
  </label>
  <select
  value={chain}
  onChange={(e) => setChain(e.target.value)}
  style={{
   width: '100%',
   padding: '10px',
   borderRadius: '6px',
   border: '1px solid #ddd',
   fontSize: '14px'
  }}
  >
  <option value="sepolia">Sepolia (테스트넷)</option>
  <option value="ethereum">Ethereum (메인넷)</option>
  </select>
  </div>

  <button 
  onClick={handleEncrypt}
  style={{
  padding: '12px 24px',
  backgroundColor: '#10b981',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500'
  }}
  >
   암호화하기
  </button>

  {encryptedData && (
  <div style={{ marginTop: '20px' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
   <h3 style={{ fontSize: '16px', margin: 0 }}>암호화 결과:</h3>
   <button
   onClick={handleCopyEncryptedData}
   style={{
   padding: '6px 12px',
   backgroundColor: '#6b7280',
   color: 'white',
   border: 'none',
   borderRadius: '6px',
   cursor: 'pointer',
   fontSize: '12px'
   }}
   >
    복사
   </button>
  </div>
  <pre style={{
   backgroundColor: 'white',
   padding: '15px',
   borderRadius: '6px',
   fontSize: '12px',
   overflow: 'auto',
   maxHeight: '300px'
  }}>
   {JSON.stringify(encryptedData, null, 2)}
  </pre>
  </div>
  )}
 </div>

 {/* 복호화 섹션 */}
 {encryptedData && (
  <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#f0fdf4', borderRadius: '8px' }}>
  <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>3. 데이터 복호화</h2>
  
  <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
   이 작업은 MetaMask 서명이 필요합니다. <br />
  NFT를 소유하고 있어야 복호화에 성공합니다.
  </p>

  <button 
  onClick={handleDecrypt}
  style={{
   padding: '12px 24px',
   backgroundColor: '#f59e0b',
   color: 'white',
   border: 'none',
   borderRadius: '8px',
   cursor: 'pointer',
   fontSize: '14px',
   fontWeight: '500'
  }}
  >
   복호화하기
  </button>

  {decryptedMessage && (
  <div style={{ marginTop: '20px' }}>
   <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>복호화 결과:</h3>
   <div style={{
   backgroundColor: 'white',
   padding: '15px',
   borderRadius: '6px',
   fontSize: '14px',
   border: '2px solid #10b981'
   }}>
   {decryptedMessage}
   </div>
  </div>
  )}
  </div>
 )}

 {/* 도움말 */}
 <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#eff6ff', borderRadius: '8px' }}>
  <h3 style={{ fontSize: '18px', marginBottom: '15px' }}> 사용 방법</h3>
  <ol style={{ fontSize: '14px', lineHeight: '1.8', color: '#1e40af', paddingLeft: '20px' }}>
  <li>먼저 <strong>Lit 클라이언트를 초기화</strong>합니다.</li>
  <li>NFT 생성 페이지에서 NFT를 생성하고 <strong>컨트랙트 주소와 토큰 ID</strong>를 복사합니다.</li>
  <li>위 정보를 입력하고 <strong>암호화</strong>를 실행합니다.</li>
  <li>
  <strong>복호화</strong>를 시도합니다. (MetaMask에서 서명 요청이 나타남)
  </li>
  <li>NFT를 소유하고 있다면 복호화에 성공합니다!</li>
  </ol>
  
  <div style={{ marginTop: '15px', padding: '15px', backgroundColor: 'white', borderRadius: '6px' }}>
  <h4 style={{ fontSize: '14px', marginBottom: '10px', fontWeight: '600' }}>
   복호화 실패 시 확인 사항:
  </h4>
  <ul style={{ fontSize: '13px', lineHeight: '1.6', color: '#666', paddingLeft: '20px', margin: 0 }}>
  <li>MetaMask가 올바른 네트워크에 연결되어 있는지 확인</li>
  <li>NFT를 실제로 소유하고 있는지 확인</li>
  <li>올바른 지갑 주소로 연결되어 있는지 확인</li>
  <li>브라우저 콘솔에서 상세 에러 메시지 확인</li>
  </ul>
  </div>

  <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#fef3c7', borderRadius: '6px' }}>
  <h4 style={{ fontSize: '14px', marginBottom: '10px', fontWeight: '600' }}>
   Lit Protocol 네트워크 구조:
  </h4>
  <ul style={{ fontSize: '13px', lineHeight: '1.6', color: '#78350f', paddingLeft: '20px', margin: 0 }}>
  <li><strong>Datil Network</strong>: 암호화/복호화 수행 (자동 연결)</li>
  <li><strong>Chronicle Yellowstone</strong>: PKP 관리 (백그라운드 자동 처리)</li>
  <li><strong>Sepolia/Ethereum</strong>: NFT 존재 및 소유 확인</li>
  </ul>
  <p style={{ fontSize: '12px', marginTop: '10px', marginBottom: 0, color: '#78350f' }}>
   자세한 정보: <a href="https://developer.litprotocol.com/connecting-to-a-lit-network/lit-blockchains/chronicle-yellowstone" target="_blank" rel="noopener noreferrer" style={{ color: '#f59e0b', textDecoration: 'underline' }}>Chronicle Yellowstone 문서</a>
  </p>
  </div>
 </div>

 {/* 홈으로 돌아가기 */}
 <div style={{ marginTop: '30px', textAlign: 'center' }}>
  <a 
  href="/"
  style={{
  display: 'inline-block',
  padding: '12px 24px',
  backgroundColor: '#6b7280',
  color: 'white',
  textDecoration: 'none',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: '500'
  }}
  >
   홈으로 돌아가기
  </a>
 </div>
 </div>
 );
}

