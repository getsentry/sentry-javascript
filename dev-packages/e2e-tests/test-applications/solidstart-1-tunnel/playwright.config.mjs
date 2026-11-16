import { getPlaywrightConfig } from '@sentry-internal/test-utils';

export default getPlaywrightConfig({
  // `vinxi dev` ignores PORT.
  startCommand:
    process.env.TEST_ENV === 'development'
      ? `NODE_OPTIONS='--import ./instrument.server.mjs' pnpm exec vinxi dev --port 3030`
      : `pnpm start`,
});
