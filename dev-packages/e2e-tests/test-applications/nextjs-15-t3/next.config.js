await import('./src/env.js');

/** @type {import("next").NextConfig} */
const config = {};

import { withSentryConfig } from '@sentry/nextjs';

export default withSentryConfig(config, {
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
  silent: true,
});
