import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const APP_PORT = 38788;

const config = getPlaywrightConfig(
  {
    startCommand: `pnpm preview`,
    port: APP_PORT,
  },
  // Each test drives a real OpenRouter tool-calling turn (up to two model calls) and then waits for
  // the spans to flush, which does not fit the default 30s timeout when the provider is slow. The
  // serial default from `getPlaywrightConfig` is kept: these turns share one worker and one event
  // proxy, so running them in parallel only makes traces harder to tell apart.
  { timeout: 90_000 },
);

export default config;
