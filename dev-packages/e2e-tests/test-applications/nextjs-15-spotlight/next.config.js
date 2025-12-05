const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Environment variables for Spotlight testing
  // NEXT_PUBLIC_* vars are embedded in the client bundle
  env: {
    NEXT_PUBLIC_SENTRY_SPOTLIGHT: 'true',
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
});
