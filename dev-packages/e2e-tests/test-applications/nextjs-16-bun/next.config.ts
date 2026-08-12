import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  silent: true,
  applicationKey: 'nextjs-16-bun-e2e',
});
