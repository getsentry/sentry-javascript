import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig(
  { startCommand: 'pnpm start' },
  // Each test drives real OpenRouter tool-calling turns, and one restarts the server mid-run, which
  // does not fit the default 30s timeout when the provider is slow.
  { timeout: 120_000 },
);

export default config;
