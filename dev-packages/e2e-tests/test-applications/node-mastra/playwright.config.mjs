import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

// Run the same tests against both Mastra run modes: production (`mastra start`,
// the built Hono server) and development (`mastra dev`, Rollup watch server).
const startCommand = testEnv === 'development' ? 'pnpm dev' : 'pnpm start';

const config = getPlaywrightConfig(
  {
    startCommand,
    // Both `mastra start` and `mastra dev` serve on 4111 (set via `server.port`
    // in src/mastra/index.ts), not the 3030 the helper assumes.
    port: 4111,
  },
  // Each test drives a real OpenRouter tool-calling turn (two model calls) and
  // then waits for the Mastra spans to flush, which does not fit the default
  // 30s test timeout when the provider is slow.
  { timeout: 90_000 },
);

export default config;
