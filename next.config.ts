import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
    ],
  },
  eslint: {
    // ESLint will run during builds - warnings allowed, errors will fail build
    // Currently only has exhaustive-deps warnings which are acceptable
    ignoreDuringBuilds: false,
  },
  typescript: {
    // The project type-checks cleanly; keep it that way so broken code can't ship.
    ignoreBuildErrors: false,
  },
  // Security + Caching headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' }
        ]
      },
      // Cache storefront API routes aggressively (5 min CDN, revalidate in background)
      {
        source: '/api/storefront/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=900, stale-while-revalidate=1800' }
        ]
      },
      // Cache static assets (JS, CSS, fonts) for 1 year — production only, where
      // file names carry content hashes. Dev chunk names don't change.
      ...(process.env.NODE_ENV === 'production'
        ? [{
            source: '/_next/static/:path*',
            headers: [
              { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
            ]
          }]
        : []),
      // Cache optimized images for 30 days
      {
        source: '/_next/image',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }
        ]
      }
    ];
  }
};

export default nextConfig;
