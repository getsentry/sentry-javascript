const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['custom.tsx', 'custom.ts', 'custom.jsx', 'custom.js'],
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
