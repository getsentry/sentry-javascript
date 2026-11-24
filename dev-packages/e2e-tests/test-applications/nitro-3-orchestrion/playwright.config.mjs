import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV || 'production';

const getStartCommand = () => {
  // The runtime hook instruments the dev server, which loads Nitro from `node_modules` unbundled.
  const devEnv = `PORT=3030 NODE_OPTIONS='--import ./runtime-hook.mjs --import ./instrument.mjs'`;

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

// The tests read the channel events from the app, so there is no event proxy.
export default getPlaywrightConfig(undefined, {
  webServer: [
    {
      command: getStartCommand(),
      port: 3030,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { PORT: '3030' },
    },
  ],
});
