/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@otak-jinro/shared'],
  env: {
    NEXT_PUBLIC_WORKERS_URL: process.env.NEXT_PUBLIC_WORKERS_URL || 'https://otak-jinro-workers.systemexe-research-and-development.workers.dev',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'wss://otak-jinro-workers.systemexe-research-and-development.workers.dev',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_WORKERS_URL || 'https://otak-jinro-workers.systemexe-research-and-development.workers.dev'}/api/:path*`,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

module.exports = nextConfig;