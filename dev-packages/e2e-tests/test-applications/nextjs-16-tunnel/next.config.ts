import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/keyring'],
  webpack: config => {
    config.externals.push('@napi-rs/keyring');
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  tunnelRoute: true,
});
