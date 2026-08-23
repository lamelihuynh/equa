import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;