import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';
const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const getStartCommand = () => {
  if (testEnv === 'development-webpack') {
    return 'pnpm next dev -p 3030 --webpack 2>&1 | tee .tmp_dev_server_logs';
  }

  if (testEnv === 'development') {
    return 'pnpm next dev -p 3030 2>&1 | tee .tmp_dev_server_logs';
  }

  if (testEnv === 'production') {
    return getRuntime() === 'cloudflare' ? 'pnpm start:cloudflare --port 3030' : 'pnpm next start -p 3030';
  }

  throw new Error(`Unknown test env: ${testEnv}`);
};

const config = getPlaywrightConfig({
  startCommand: getStartCommand(),
  port: 3030,
});

export default config;
