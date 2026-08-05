import { getPlaywrightConfig } from '@sentry-internal/test-utils';
const testEnv = process.env.TEST_ENV;

if (testEnv !== 'production') {
  throw new Error(`Unknown test env: ${testEnv} - the standalone output only exists for production builds`);
}

const config = getPlaywrightConfig({
  startCommand: 'PORT=3030 node .next/standalone/server.js',
  port: 3030,
});

export default config;
