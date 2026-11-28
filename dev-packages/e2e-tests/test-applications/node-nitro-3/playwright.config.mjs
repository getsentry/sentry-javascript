import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV || 'production';

const getStartCommand = () => {
  switch (testEnv) {
    case 'development':
      return 'PORT=3030 pnpm exec nitro dev --port 3030';
    case 'production':
      return 'pnpm start';
    default:
      throw new Error(`Unknown test env: ${testEnv}`);
  }
};

export default getPlaywrightConfig({
  startCommand: getStartCommand(),
});
