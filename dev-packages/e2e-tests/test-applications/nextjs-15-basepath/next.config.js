const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/my-app',
  serverExternalPackages: ['@napi-rs/keyring'],
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
});
