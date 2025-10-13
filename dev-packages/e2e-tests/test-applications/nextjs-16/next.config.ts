import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // experimental: {
  //   cacheComponents: true,
  // },
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
