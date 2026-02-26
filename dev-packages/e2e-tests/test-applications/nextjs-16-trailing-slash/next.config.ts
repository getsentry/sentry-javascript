import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  trailingSlash: true,
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
