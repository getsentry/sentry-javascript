import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;
const useOrchestrion = process.env.USE_ORCHESTRION === '1';

if (!testEnv) {
  throw new Error('No test env defined');
}

let startCommand = testEnv === 'development' ? 'pnpm dev' : 'pnpm start';

if (useOrchestrion) {
  startCommand = `${startCommand}:orchestrion`;
}

const config = getPlaywrightConfig(
  { startCommand },
  // Each agent turn is a real OpenRouter tool-calling round trip (two model calls) followed by a
  // span flush, which does not fit the default 30s timeout when the provider is slow.
  { timeout: 90_000 },
);

export default config;
