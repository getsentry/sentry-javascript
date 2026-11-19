import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig(
  { startCommand: 'pnpm start' },
  // Each test drives a real OpenRouter tool-calling turn and then waits for the spans to flush,
  // which does not fit the default 30s timeout when the provider is slow.
  { timeout: 90_000 },
);

export default config;
