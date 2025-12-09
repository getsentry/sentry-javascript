const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

module.exports = withSentryConfig(nextConfig, {
  debug: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // For webpack variant
  webpack: {
    excludeServerRoutes: ['/api/endpoint-excluded-with-string', /\/api\/endpoint-excluded-with-regex/],
  },
});
