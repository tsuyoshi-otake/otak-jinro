/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@otak-jinro/shared'],
  // GitHub Pages用の静的エクスポート設定
  output: 'export',
  trailingSlash: true,
  distDir: 'out',
  // GitHub Pagesのサブパス設定
  basePath: process.env.NODE_ENV === 'production' ? '/otak-jinro' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/otak-jinro/' : '',
  env: {
    NEXT_PUBLIC_WORKERS_URL: process.env.NEXT_PUBLIC_WORKERS_URL || 'https://otak-jinro-workers.systemexe-research-and-development.workers.dev',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'wss://otak-jinro-workers.systemexe-research-and-development.workers.dev',
  },
  // 静的エクスポートでは rewrites は使用できないため削除
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
  // 画像最適化を無効化（静的エクスポート用）
  images: {
    unoptimized: true,
  },
  // 動的ルートを無効化
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
};

module.exports = nextConfig;