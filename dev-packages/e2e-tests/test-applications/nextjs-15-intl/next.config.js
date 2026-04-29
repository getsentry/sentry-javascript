const { withSentryConfig } = require('@sentry/nextjs');
const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@napi-rs/keyring'],
};

module.exports = withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
});
