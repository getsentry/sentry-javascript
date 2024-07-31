const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const moduleExports = {
  typescript: {
    ignoreBuildErrors: true, // TODO: Remove this
  },
  experimental: {
    appDir: true,
  },
  pageExtensions: ['jsx', 'js', 'tsx', 'ts', 'page.tsx'],
};

module.exports = withSentryConfig(moduleExports, {
  silent: true,
  excludeServerRoutes: ['/api/excludedEndpoints/excludedWithString', /\/api\/excludedEndpoints\/excludedWithRegExp/],
});
