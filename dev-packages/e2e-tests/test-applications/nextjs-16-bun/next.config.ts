import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  silent: true,
  _experimental: {
    turbopackApplicationKey: 'nextjs-16-bun-e2e',
  },
});
