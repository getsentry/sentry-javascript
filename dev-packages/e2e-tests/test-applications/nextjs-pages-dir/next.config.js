const { withSentryConfig } = require('@sentry/nextjs/config');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
};

module.exports = withSentryConfig(nextConfig, {
  debug: true,
  tunnelRoute: !!process.env.NEXT_PUBLIC_E2E_TUNNEL,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
