import type { NextConfig } from 'next';

const gatewayUrl = process.env.EQUA_GATEWAY_URL?.replace(/\/+$/, '');
const identityHealthUrl = process.env.EQUA_IDENTITY_HEALTH_URL?.replace(/\/+$/, '');

if (process.env.VERCEL) {
  if (!gatewayUrl)
    throw new Error('EQUA_GATEWAY_URL must be configured for the Vercel deployment.');
  if (!identityHealthUrl)
    throw new Error('EQUA_IDENTITY_HEALTH_URL must be configured for the Vercel deployment.');
  const gateway = new URL(gatewayUrl);
  if (
    gateway.protocol !== 'https:' ||
    gateway.pathname !== '/' ||
    gateway.search !== '' ||
    gateway.hash !== '' ||
    gateway.hostname === 'localhost' ||
    gateway.hostname.endsWith('.internal')
  )
    throw new Error('EQUA_GATEWAY_URL must be a public HTTPS origin for the Vercel deployment.');
  const identityHealth = new URL(identityHealthUrl);
  if (
    identityHealth.protocol !== 'https:' ||
    identityHealth.pathname !== '/health' ||
    identityHealth.search !== '' ||
    identityHealth.hash !== '' ||
    identityHealth.hostname === 'localhost' ||
    identityHealth.hostname.endsWith('.internal')
  )
    throw new Error('EQUA_IDENTITY_HEALTH_URL must be a public HTTPS Identity /health URL.');
  if (process.env.NEXT_PUBLIC_API_BASE_URL !== '/v1')
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be /v1 for the same-origin Vercel API rewrite.');
}

const nextConfig: NextConfig = {
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  ...(process.env.VERCEL && gatewayUrl && identityHealthUrl
    ? {
        env: {
          NEXT_PUBLIC_GATEWAY_HEALTH_URL: `${gatewayUrl}/health`,
          NEXT_PUBLIC_IDENTITY_HEALTH_URL: identityHealthUrl,
        },
      }
    : {}),
  ...(process.env.VERCEL
    ? {
        rewrites() {
          return [
            {
              source: '/v1/auth/_ready',
              destination: `${gatewayUrl}/health`,
            },
            {
              source: '/v1/:path*',
              destination: `${gatewayUrl}/v1/:path*`,
            },
          ];
        },
      }
    : {}),
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
