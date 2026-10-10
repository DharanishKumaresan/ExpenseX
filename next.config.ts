import type { NextConfig } from 'next';

/**
 * Security headers applied to every response. `frame-ancestors 'none'` plus
 * X-Frame-Options blocks clickjacking of the money-moving UI; the referrer and
 * permissions policies keep financial page URLs and device APIs locked down.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js injects inline bootstrap scripts; 'unsafe-eval' is dev-only for React Refresh.
      process.env.NODE_ENV === 'development'
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      // The PWA service worker and the installed app's own manifest.
      "worker-src 'self'",
      "manifest-src 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Server Actions are the mutation surface; keep payloads small on purpose.
    serverActions: { bodySizeLimit: '1mb' },
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },

      /**
       * The worker must never be served from cache: a stale sw.js keeps the
       * old one alive forever and a deploy never reaches anyone who has
       * already visited. `Service-Worker-Allowed` lets it claim the whole
       * origin even though it is fetched from the root.
       */
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
        ],
      },
      // Icon paths are stable across releases, so revalidate their content.
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
