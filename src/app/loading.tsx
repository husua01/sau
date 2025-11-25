export default function Loading() {
 return (
 <>
 <style dangerouslySetInnerHTML={{
  __html: `
  @keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
  }
  `
 }} />
 <div style={{
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#f8fafc',
  fontFamily: 'system-ui, -apple-system, sans-serif'
 }}>
  <div style={{
  textAlign: 'center'
  }}>
  <div style={{
  width: '60px',
  height: '60px',
  border: '4px solid #e5e7eb',
  borderTop: '4px solid #3b82f6',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
  margin: '0 auto 20px auto'
  }}></div>
  
  <h2 style={{
  fontSize: '1.25rem',
  fontWeight: '600',
  color: '#374151',
  marginBottom: '8px'
  }}>
  로딩 중...
  </h2>
  
  <p style={{
  color: '#6b7280',
  fontSize: '0.875rem'
  }}>
  페이지를 불러오는 중입니다
  </p>
  </div>
 </div>
 </>
 )
}
