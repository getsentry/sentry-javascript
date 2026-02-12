const { withSentryConfig } = require('@sentry/nextjs');

// Simulate Vercel environment for cron monitoring tests
process.env.VERCEL = '1';

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  release: {
    name: 'foobar123',
  },
  _experimental: {
    vercelCronsMonitoring: true,
  },
});
