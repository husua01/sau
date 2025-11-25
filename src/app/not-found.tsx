'use client'

import Link from 'next/link'

export default function NotFound() {
 return (
 <div style={{
 minHeight: '100vh',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 backgroundColor: '#f8fafc',
 fontFamily: 'system-ui, -apple-system, sans-serif',
 padding: '20px'
 }}>
 <div style={{
  backgroundColor: 'white',
  borderRadius: '16px',
  padding: '40px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  maxWidth: '500px',
  width: '100%',
  textAlign: 'center'
 }}>
  <div style={{
  fontSize: '4rem',
  marginBottom: '20px'
  }}>
  
  </div>
  
  <h1 style={{
  fontSize: '2rem',
  fontWeight: 'bold',
  color: '#1f2937',
  marginBottom: '16px'
  }}>
  404
  </h1>
  
  <h2 style={{
  fontSize: '1.25rem',
  fontWeight: '600',
  color: '#374151',
  marginBottom: '16px'
  }}>
  페이지를 찾을 수 없습니다
  </h2>
  
  <p style={{
  color: '#6b7280',
  marginBottom: '32px',
  lineHeight: '1.6'
  }}>
  요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
  </p>
  
  <div style={{
  display: 'flex',
  gap: '12px',
  justifyContent: 'center',
  flexWrap: 'wrap'
  }}>
  <Link 
  href="/"
  style={{
   display: 'inline-block',
   padding: '12px 24px',
   backgroundColor: '#3b82f6',
   color: 'white',
   textDecoration: 'none',
   borderRadius: '8px',
   fontSize: '0.875rem',
   fontWeight: '600',
   transition: 'background-color 0.2s'
  }}
  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
  >
  홈으로 이동
  </Link>
  
  <Link 
  href="/create"
  style={{
   display: 'inline-block',
   padding: '12px 24px',
   backgroundColor: '#8b5cf6',
   color: 'white',
   textDecoration: 'none',
   borderRadius: '8px',
   fontSize: '0.875rem',
   fontWeight: '600',
   transition: 'background-color 0.2s'
  }}
  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#7c3aed'}
  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#8b5cf6'}
  >
  NFT 생성하기
  </Link>
  
  <Link 
  href="/access"
  style={{
   display: 'inline-block',
   padding: '12px 24px',
   backgroundColor: '#10b981',
   color: 'white',
   textDecoration: 'none',
   borderRadius: '8px',
   fontSize: '0.875rem',
   fontWeight: '600',
   transition: 'background-color 0.2s'
  }}
  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
  >
  데이터 접근
  </Link>
  </div>
  
  <div style={{
  marginTop: '32px',
  padding: '20px',
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  border: '1px solid #e5e7eb'
  }}>
  <h3 style={{
  fontSize: '1rem',
  fontWeight: '600',
  color: '#374151',
  marginBottom: '12px'
  }}>
   도움말
  </h3>
  <ul style={{
  textAlign: 'left',
  color: '#6b7280',
  fontSize: '0.875rem',
  lineHeight: '1.6',
  paddingLeft: '20px'
  }}>
  <li>URL을 다시 확인해보세요</li>
  <li>페이지가 이동되었을 수 있습니다</li>
  <li>브라우저를 새로고침해보세요</li>
  </ul>
  </div>
 </div>
 </div>
 )
}
