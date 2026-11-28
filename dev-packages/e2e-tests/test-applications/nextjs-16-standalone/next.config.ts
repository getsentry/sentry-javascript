import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    webpackBuildWorker: true,
    parallelServerCompiles: true,
    parallelServerBuildTraces: true,
  },
  output: 'standalone',
  // Pin the tracing root to this app so the standalone server always ends up at
  // .next/standalone/server.js, even when the app runs inside the SDK monorepo.
  outputFileTracingRoot: __dirname,
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
