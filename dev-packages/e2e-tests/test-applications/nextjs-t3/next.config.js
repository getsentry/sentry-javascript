await import('./src/env.js');

/** @type {import("next").NextConfig} */
const config = {};

import { withSentryConfig } from '@sentry/nextjs';

export default withSentryConfig(config, {
  disableLogger: true,
  silent: true,
});
