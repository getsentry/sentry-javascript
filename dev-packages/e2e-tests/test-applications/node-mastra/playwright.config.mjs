import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig(
  {
    startCommand: 'pnpm start',
    // Mastra's built Hono server listens on 4111 by default (set explicitly in
    // src/mastra/index.ts), not the 3030 the helper assumes.
    port: 4111,
  },
  // Each test drives a real OpenRouter tool-calling turn (two model calls) and
  // then waits for the Mastra spans to flush, which does not fit the default
  // 30s test timeout when the provider is slow.
  { timeout: 90_000 },
);

export default config;
