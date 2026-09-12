import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  // Ignored by browsers over plain HTTP, safe for local development.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // Cross-origin isolation: the decryption key lives in the URL fragment, so
  // cut off cross-window references and resource loads.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  // Standalone output exists only for the Docker image, which ships the
  // self-contained server.js (see Dockerfile). Everywhere else — `next start`
  // for local runs, the test orchestrator and CI — the flag only earns a
  // startup warning, so the image build opts in via NVEIL_STANDALONE=1.
  ...(process.env.NVEIL_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  // No version disclosure (Next defaults this to true).
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
