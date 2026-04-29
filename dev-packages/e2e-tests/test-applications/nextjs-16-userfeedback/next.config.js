const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@napi-rs/keyring'],
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
});
