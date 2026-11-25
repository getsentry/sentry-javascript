import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV || 'production';

const getStartCommand = () => {
  const devEnv = `PORT=3030 NODE_OPTIONS='--import @sentry/node/import'`;

  switch (testEnv) {
    case 'development':
      return `${devEnv} pnpm exec vite dev --port 3030`;
    case 'dev-nitro':
      // Without it, the Nitro CLI picks the Vite builder because `vite.config.ts` registers Nitro's plugin.
      return `${devEnv} NITRO_BUILDER=rolldown pnpm exec nitro dev --port 3030`;
    case 'production':
    case 'prod-nitro':
      return 'pnpm start';
    default:
      throw new Error(`Unknown test env: ${testEnv}`);
  }
};

export default getPlaywrightConfig({
  startCommand: getStartCommand(),
  // `vite dev` loads the server entry, and with it `Sentry.init()`, on the first request, which then has no
  // `http.server` span. Waiting on a request keeps it out of the tests.
  url: 'http://localhost:3030/api/test-static',
});
