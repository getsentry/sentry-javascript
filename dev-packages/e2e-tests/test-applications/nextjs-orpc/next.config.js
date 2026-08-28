/** @type {import("next").NextConfig} */
const config = {};

import { withSentryConfig } from '@sentry/nextjs/config';

export default withSentryConfig(config, {
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
