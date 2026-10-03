import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

// Simulate Vercel environment for cron monitoring tests
process.env.VERCEL = '1';

const nextConfig: NextConfig = {
  // `pg` requires `pg-cloudflare` on Workers. The file tracing only copies its Node.js build, and OpenNext copies the
  // whole package (with its `workerd` build) only for packages listed here.
  serverExternalPackages: ['pg-cloudflare'],
  experimental: {
    sri: {
      algorithm: 'sha256',
    },
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  applicationKey: 'nextjs-16-e2e',
  reactComponentAnnotation: {
    enabled: true,
  },
  _experimental: {
    vercelCronsMonitoring: true,
  },
});
