import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: 'ORIGIN=http://localhost:3030 node ./build/index.js',
  port: 3030,
});

export default config;
