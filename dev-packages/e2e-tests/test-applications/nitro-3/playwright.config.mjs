import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand:
    process.env.TEST_ENV === 'development'
      ? `PORT=3030 NODE_OPTIONS='--import ./instrument.mjs' pnpm exec vite dev --port 3030`
      : `pnpm start`,
});

export default config;
