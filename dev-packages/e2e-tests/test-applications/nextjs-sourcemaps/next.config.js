const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSentryConfig(nextConfig, {
  sentryUrl: 'http://localhost:3032',
  authToken: 'fake-auth-token',
  org: 'test-org',
  project: 'test-project',
  release: {
    name: 'test-release',
  },
  sourcemaps: {
    deleteSourcemapsAfterUpload: false,
  },
  debug: true,
});
