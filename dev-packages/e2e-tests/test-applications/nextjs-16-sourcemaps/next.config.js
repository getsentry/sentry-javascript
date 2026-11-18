const { withSentryConfig } = require('@sentry/nextjs/config');

// `delete-option`: the app turns the client source maps on itself, and `sourcemaps.delete: true` removes them.
// `manual-upload`: Sentry uploads nothing and keeps the maps it turned on, for an upload with the CLI.
const variant = process.env.E2E_VARIANT;

/** @type {import('next').NextConfig} */
const nextConfig = variant === 'delete-option' ? { productionBrowserSourceMaps: true } : {};

module.exports = withSentryConfig(nextConfig, {
  sentryUrl: 'http://localhost:3032',
  authToken: 'fake-auth-token',
  org: 'test-org',
  project: 'test-project',
  release: {
    name: 'test-release',
  },
  sourcemaps:
    variant === 'delete-option'
      ? { delete: true }
      : variant === 'manual-upload'
        ? { upload: false, delete: false }
        : {
            // The delete variants use the SDK default, which removes the client maps after the upload.
            deleteSourcemapsAfterUpload: process.env.E2E_DELETE_SOURCEMAPS ? undefined : false,
          },
  debug: true,
});
