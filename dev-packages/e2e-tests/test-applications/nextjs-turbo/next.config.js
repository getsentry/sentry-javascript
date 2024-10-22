const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: {}, // Enables Turbopack for builds
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
});
