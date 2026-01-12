const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NEXT_PUBLIC_SENTRY_SPOTLIGHT is set via environment variable in CI
  // The SDK reads it from process.env during withSentryConfig()
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
});
