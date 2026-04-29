await import('./src/env.js');

/** @type {import("next").NextConfig} */
const config = {
  serverExternalPackages: ['@napi-rs/keyring'],
};

import { withSentryConfig } from '@sentry/nextjs';

export default withSentryConfig(config, {
  disableLogger: true,
  silent: true,
});
