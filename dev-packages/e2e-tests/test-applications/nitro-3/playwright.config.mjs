import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV || 'production';

const getStartCommand = () => {
  const devEnv = `PORT=3030 NODE_OPTIONS='--import ./instrument.mjs'`;

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
});
