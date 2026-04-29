import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  trailingSlash: true,
  serverExternalPackages: ['@napi-rs/keyring'],
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
