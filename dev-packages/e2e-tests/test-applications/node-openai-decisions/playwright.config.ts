import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig(
  { startCommand: 'pnpm start' },
  // Each test makes a real Decisions API call, which does not reliably fit the default 30s timeout.
  { timeout: 90_000 },
);

export default config;
