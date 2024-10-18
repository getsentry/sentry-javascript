const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheHandler: require.resolve('next/dist/server/lib/incremental-cache/file-system-cache.js'),
  cacheMaxMemorySize: 0,
  experimental: {
    ppr: true,
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
});
