/** @type {import("next").NextConfig} */
const config = {};

const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(config, {
  disableLogger: true,
});
