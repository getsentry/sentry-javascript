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

const config = getPlaywrightConfig({
  startCommand,
});

export default config;
