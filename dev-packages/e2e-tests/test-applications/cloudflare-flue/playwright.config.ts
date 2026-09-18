import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const config = getPlaywrightConfig(
  { startCommand: 'pnpm preview', port: 4112 },
  // Each test drives a real OpenRouter turn and then waits for the spans to flush, which does not
  // fit the default 30s timeout when the provider is slow.
  { timeout: 90_000 },
);

export default config;
