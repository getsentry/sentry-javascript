import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  adapterPath: require.resolve('./adapter.mjs'),
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
