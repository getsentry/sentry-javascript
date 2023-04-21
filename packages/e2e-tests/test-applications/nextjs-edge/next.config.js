const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    appDir: true,
  },
};

module.exports = nextConfig;

module.exports = withSentryConfig(
  module.exports,
  {
    silent: true,
    dryRun: true,
  },
  {
    hideSourceMaps: true,
  },
);
