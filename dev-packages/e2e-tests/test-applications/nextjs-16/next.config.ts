import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const isCanaryBuild = process.env.CANARY_BUILD === 'true';

const nextConfig: NextConfig = {
  experimental: {
    ...(isCanaryBuild ? { cacheComponents: true } : {}),
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
