import type { NextConfig } from 'next';

const API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Browser calls relative /api/* → Next.js proxies to the backend (works in preview, Vercel, Docker).
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
      { source: '/health', destination: `${API_URL}/health` },
    ];
  },
  // Accept the sandbox / preview origins for server actions & dev HMR
  allowedDevOrigins: ['*.e2b.app', 'localhost', '127.0.0.1'],
  experimental: { optimizePackageImports: ['lucide-react', 'recharts'] },
};

export default nextConfig;
