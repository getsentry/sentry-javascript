import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const APP_PORT = 4111;

const config = getPlaywrightConfig(
  {
    startCommand: 'pnpm preview',
    port: APP_PORT,
  },
  // Each test drives a real OpenRouter tool-calling turn (two model calls) and then
  // waits for the Mastra spans to flush, which does not fit the default 30s timeout
  // when the provider is slow.
  { timeout: 90_000 },
);

export default config;
