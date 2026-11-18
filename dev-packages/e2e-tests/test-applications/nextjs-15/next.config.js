const { withSentryConfig } = require('@sentry/nextjs/config');

// Simulate Vercel environment for cron monitoring tests
process.env.VERCEL = '1';

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  release: {
    name: 'foobar123',
    inject: !process.env.E2E_RELEASE_NOT_INJECTED,
  },
  _experimental: {
    vercelCronsMonitoring: true,
  },
});
