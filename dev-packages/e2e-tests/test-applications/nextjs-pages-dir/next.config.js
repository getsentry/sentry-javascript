const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
    serverActions: true,
  },
};

module.exports = withSentryConfig(nextConfig, {
  debug: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
