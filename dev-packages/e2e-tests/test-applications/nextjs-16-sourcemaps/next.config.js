const { withSentryConfig } = require('@sentry/nextjs/config');

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
    // The delete variants use the SDK default, which removes the client maps after the upload.
    deleteSourcemapsAfterUpload: process.env.E2E_DELETE_SOURCEMAPS ? undefined : false,
  },
  debug: true,
});
