const { withSentryConfig } = require('@sentry/nextjs');

const moduleExports = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    appDir: Number(process.env.NODE_MAJOR) >= 16, // experimental.appDir requires Node v16.8.0 or later.
  },
  pageExtensions: ['jsx', 'js', 'tsx', 'ts', 'page.tsx'],
};

module.exports = withSentryConfig(moduleExports, {
  debug: true,
  excludeServerRoutes: ['/api/excludedEndpoints/excludedWithString', /\/api\/excludedEndpoints\/excludedWithRegExp/],
});
