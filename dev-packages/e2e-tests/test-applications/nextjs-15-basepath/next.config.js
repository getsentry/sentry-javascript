const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/my-app',
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
});
