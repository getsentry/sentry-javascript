import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const config = getPlaywrightConfig(
  { startCommand: testEnv === 'development' ? 'pnpm dev' : 'pnpm start' },
  // Each test drives a real OpenRouter tool-calling turn and then waits for the spans to flush,
  // which does not fit the default 30s timeout when the provider is slow.
  { timeout: 90_000 },
);

export default config;
