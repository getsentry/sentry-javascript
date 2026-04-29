import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

// Simulate Vercel environment for cron monitoring tests
process.env.VERCEL = '1';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/keyring'],
  webpack: config => {
    config.externals.push('@napi-rs/keyring');
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  _experimental: {
    vercelCronsMonitoring: true,
    turbopackApplicationKey: 'nextjs-16-e2e',
    turbopackReactComponentAnnotation: {
      enabled: true,
    },
  },
});
