/** @type {import("next").NextConfig} */
const config = {};

const { withSentryConfig } = require('@sentry/nextjs/config');

module.exports = withSentryConfig(config, {
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
