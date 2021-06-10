const { withSentryConfig } = require('@sentry/nextjs');

const moduleExports = {};
const SentryWebpackPluginOptions = {
  dryRun: true,
  silent: true,
};

module.exports = withSentryConfig(moduleExports, SentryWebpackPluginOptions);
