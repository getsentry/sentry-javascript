const { withSentryConfig } = require('@sentry/nextjs');

const moduleExports = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  pageExtensions: ['jsx', 'js', 'tsx', 'ts', 'page.tsx'],
};

module.exports = withSentryConfig(moduleExports, {
  debug: true,
  excludeServerRoutes: ['/api/excludedEndpoints/excludedWithString', /\/api\/excludedEndpoints\/excludedWithRegExp/],
});
