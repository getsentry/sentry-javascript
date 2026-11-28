const { withSentryConfig } = require('@sentry/nextjs/config');
const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    webpackBuildWorker: true,
    parallelServerCompiles: true,
    parallelServerBuildTraces: true,
  },
};

module.exports = withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
});
