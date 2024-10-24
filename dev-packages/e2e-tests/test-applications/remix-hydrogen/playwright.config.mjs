import {getPlaywrightConfig} from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: `pnpm run start`,
  port: 3000,
});

export default config;
