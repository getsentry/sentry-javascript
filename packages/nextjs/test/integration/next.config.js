const { withSentryConfig } = require('@sentry/nextjs');

const moduleExports = {
  eslint: {
    ignoreDuringBuilds: true,
  }
};
const SentryWebpackPluginOptions = {
  dryRun: true,
  silent: true,
};

module.exports = withSentryConfig(moduleExports, SentryWebpackPluginOptions);
