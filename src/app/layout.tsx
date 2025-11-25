import './globals.css'

export const metadata = {
 title: "SAU Platform",
 description: "탈중앙화 영구 저장 및 콘텐츠 플랫폼",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
 return (
 <html lang="ko">
 <head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <meta name="theme-color" content="#3b82f6" />
  <script dangerouslySetInnerHTML={{__html: `
  (function() {
  const noop = function() {};
  console.log = noop;
  console.warn = noop;
  console.groupCollapsed = noop;
  console.groupEnd = noop;
  })();
  `}} />
 </head>
 <body>
  {children}
 </body>
 </html>
 );
}