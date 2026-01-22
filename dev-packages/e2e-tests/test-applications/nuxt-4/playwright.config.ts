import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const getStartCommand = () => {
  if (testEnv === 'development') {
    return "NODE_OPTIONS='--import ./.nuxt/dev/sentry.server.config.mjs' nuxt dev -p 3030";
  }

  if (testEnv === 'production') {
    return 'pnpm start:import';
  }

  throw new Error(`Unknown test env: ${testEnv}`);
};

const config = getPlaywrightConfig({
  startCommand: getStartCommand(),
});

export default config;
