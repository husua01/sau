"use client";

import Link from 'next/link';

export default function HomePage() {
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
  maxWidth: '1000px', 
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box'
 }}>
  <header style={{ 
  textAlign: 'center',
  marginBottom: '40px',
  padding: '20px 0'
  }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
  <h1 style={{ 
   fontSize: 'clamp(2rem, 5vw, 3.5rem)',
   fontWeight: 'bold',
   color: '#1f2937',
   margin: 0,
   wordBreak: 'keep-all'
  }}>
   SAU 플랫폼
  </h1>
  <span style={{
   fontSize: 'clamp(12px, 2vw, 14px)',
   padding: '6px 14px',
   backgroundColor: '#dbeafe',
   color: '#1e40af',
   borderRadius: '16px',
   fontWeight: '600',
   alignSelf: 'flex-start',
   marginTop: 'clamp(8px, 2vw, 12px)'
  }}>
   Sepolia Testnet
  </span>
  </div>
  <p style={{ 
  fontSize: 'clamp(0.9rem, 2.5vw, 1.25rem)',
  color: '#6b7280',
  maxWidth: '600px',
  margin: '0 auto',
  lineHeight: '1.6',
  padding: '0 16px'
  }}>
  NFT 생성과 동시에 자동 접근 제어가 설정되는<br/>
  탈중앙화 영구 저장 및 콘텐츠 플랫폼
  </p>
  </header>

  <div style={{ 
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: '20px',
  marginBottom: '40px',
  padding: '0 8px'
  }}>
  <div style={{ 
  backgroundColor: 'white',
  borderRadius: '16px',
  padding: 'clamp(20px, 4vw, 32px)',
  border: '1px solid #e5e7eb',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  width: '100%',
  boxSizing: 'border-box'
  }}>
  
  
  <h2 style={{ 
   fontSize: '1.5rem',
   fontWeight: 'bold',
   color: '#1f2937',
   marginBottom: '12px'
  }}>
   NFT 생성
  </h2>
  
  <p style={{ 
   color: '#6b7280',
   lineHeight: '1.6',
   marginBottom: '24px'
  }}>
   이미지를 Pinata IPFS에 영구 저장하고 NFT로 소유권을 증명하세요. 여러 개의 NFT를 한 번에 발급할 수 있습니다.
  </p>
  
  <Link href="/create" style={{ 
   display: 'inline-block',
   backgroundColor: '#3b82f6',
   color: 'white',
   padding: '12px 24px',
   borderRadius: '8px',
   textDecoration: 'none',
   fontWeight: '500'
  }}>
   NFT 생성하기 
  </Link>
  </div>

  <div style={{ 
  backgroundColor: 'white',
  borderRadius: '16px',
  padding: 'clamp(20px, 4vw, 32px)',
  border: '1px solid #e5e7eb',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  width: '100%',
  boxSizing: 'border-box'
  }}>
  
  <h2 style={{ 
   fontSize: '1.5rem',
   fontWeight: 'bold',
   color: '#1f2937',
   marginBottom: '12px'
  }}>
   데이터 접근
  </h2>
  
  <p style={{ 
   color: '#6b7280',
   lineHeight: '1.6',
   marginBottom: '24px'
  }}>
   소유한 NFT를 조회하고 메타데이터 및 이미지를 확인하세요. Etherscan에서도 NFT 정보를 볼 수 있습니다.
  </p>
  
  <Link href="/access" style={{ 
   display: 'inline-block',
   backgroundColor: '#8b5cf6',
   color: 'white',
   padding: '12px 24px',
   borderRadius: '8px',
   textDecoration: 'none',
   fontWeight: '500'
  }}>
   데이터 접근하기 
  </Link>
  </div>
  </div>


 </div>
 </div>
 );
}