import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

// Simulate Vercel environment for cron monitoring tests
process.env.VERCEL = '1';

const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  silent: true,
  applicationKey: 'nextjs-16-streaming-e2e',
  _experimental: {
    vercelCronsMonitoring: true,
    turbopackReactComponentAnnotation: {
      enabled: true,
    },
  },
});
