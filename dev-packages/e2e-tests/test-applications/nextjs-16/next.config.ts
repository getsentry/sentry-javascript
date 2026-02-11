import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

// Simulate Vercel environment for cron monitoring tests
process.env.VERCEL = '1';

const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  silent: true,
  _experimental: {
    vercelCronsMonitoring: true,
  },
});
