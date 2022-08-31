const { withSentryConfig } = require('@sentry/nextjs');

const moduleExports = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  sentry: {
    experiments: { autoWrapDataFetchers: true },
  },
};
const SentryWebpackPluginOptions = {
  dryRun: true,
  silent: true,
};

module.exports = withSentryConfig(moduleExports, SentryWebpackPluginOptions);
