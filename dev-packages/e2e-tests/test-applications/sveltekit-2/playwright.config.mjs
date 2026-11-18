import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// The static trace lifecycle variant sets this to `static`.
process.env.E2E_TEST_TRACE_LIFECYCLE ??= 'stream';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const config = getPlaywrightConfig({
  startCommand: testEnv === 'development' ? `pnpm dev --port 3030` : `ORIGIN=http://localhost:3030 node build`,
});

export default {
  ...config,
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
};
