const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheHandler: require.resolve('next/dist/server/lib/incremental-cache/file-system-cache.js'),
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
});
