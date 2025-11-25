const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ['@irys/sdk'],
  },
  output: 'standalone',
  webpack: (config, { isServer }) => {
    const cidPath = path.resolve(__dirname, 'node_modules/multiformats/cjs/src/cid.js');
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
      '@/components': path.resolve(__dirname, 'src/components'),
      '@/lib': path.resolve(__dirname, 'src/lib'),
      '@/app': path.resolve(__dirname, 'src/app'),
      'multiformats/cid': cidPath,
    };

    // ⚡ Irys SDK는 번들링하지 않고 외부 패키지로 처리 (API Route에서 사용 가능)
    // externals에서 제거하고 serverComponentsExternalPackages로 이동
    if (isServer) {
      // '@irys/sdk'를 externals에서 제거
      config.externals = [...config.externals];
    }

    // Node.js 모듈 폴백 설정
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
      stream: false,
      url: false,
      zlib: false,
      http: false,
      https: false,
      assert: false,
      os: false,
      path: false,
    };

    return config;
  },
}

module.exports = nextConfig
