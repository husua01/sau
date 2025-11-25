'use client'

export default function GlobalError({
 error,
 reset,
}: {
 error: Error & { digest?: string }
 reset: () => void
}) {
 return (
 <html>
 <body>
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
   fontSize: '3rem',
   marginBottom: '20px'
  }}>
   
  </div>
  
  <h1 style={{
   fontSize: '1.5rem',
   fontWeight: 'bold',
   color: '#1f2937',
   marginBottom: '16px'
  }}>
   심각한 오류가 발생했습니다
  </h1>
  
  <p style={{
   color: '#6b7280',
   marginBottom: '24px',
   lineHeight: '1.6'
  }}>
   애플리케이션에서 심각한 오류가 발생했습니다. 페이지를 새로고침하거나 잠시 후 다시 시도해주세요.
  </p>
  
  <div style={{
   display: 'flex',
   gap: '12px',
   justifyContent: 'center',
   flexWrap: 'wrap'
  }}>
   <button
   onClick={reset}
   style={{
   padding: '12px 24px',
   backgroundColor: '#3b82f6',
   color: 'white',
   border: 'none',
   borderRadius: '8px',
   fontSize: '0.875rem',
   fontWeight: '600',
   cursor: 'pointer',
   transition: 'background-color 0.2s'
   }}
   onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
   onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
   >
   다시 시도
   </button>
   
   <button
   onClick={() => window.location.href = '/'}
   style={{
   padding: '12px 24px',
   backgroundColor: '#6b7280',
   color: 'white',
   border: 'none',
   borderRadius: '8px',
   fontSize: '0.875rem',
   fontWeight: '600',
   cursor: 'pointer',
   transition: 'background-color 0.2s'
   }}
   onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
   onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#6b7280'}
   >
   홈으로 이동
   </button>
  </div>
  
  {error.digest && (
   <details style={{
   marginTop: '24px',
   padding: '16px',
   backgroundColor: '#f8fafc',
   borderRadius: '8px',
   border: '1px solid #e5e7eb'
   }}>
   <summary style={{
   cursor: 'pointer',
   fontSize: '0.875rem',
   color: '#6b7280',
   fontWeight: '500'
   }}>
   기술적 세부사항
   </summary>
   <pre style={{
   marginTop: '12px',
   fontSize: '0.75rem',
   color: '#374151',
   fontFamily: 'monospace',
   whiteSpace: 'pre-wrap',
   wordBreak: 'break-word'
   }}>
   {error.message}
   {error.digest && `\n\nError ID: ${error.digest}`}
   </pre>
   </details>
  )}
  </div>
  </div>
 </body>
 </html>
 )
}
