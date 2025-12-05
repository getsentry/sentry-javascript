const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Environment variables for Spotlight testing
  // NEXT_PUBLIC_* vars are embedded in the client bundle
  env: {
    NEXT_PUBLIC_SENTRY_SPOTLIGHT: 'true',
  },

  // Configure webpack to use 'development' export condition in dev mode
  // This enables Sentry SDK's development-only features like Spotlight auto-enablement
  // Note: This is required because Next.js doesn't use the 'development' condition by default
  webpack: (config, { dev }) => {
    if (dev) {
      config.resolve = config.resolve || {};
      config.resolve.conditionNames = [
        'development',
        ...(config.resolve.conditionNames || ['import', 'module', 'browser', 'require', 'node', 'default']),
      ];
    }
    return config;
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
});
