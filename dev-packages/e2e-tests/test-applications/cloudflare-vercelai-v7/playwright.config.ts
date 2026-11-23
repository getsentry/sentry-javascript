import { getPlaywrightConfig } from '@sentry-internal/test-utils';
const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const APP_PORT = 8787;

const config = getPlaywrightConfig(
  {
    // `vite dev` pre-bundles `ai` with the esbuild dependency optimizer of Vite 7.
    startCommand: testEnv === 'development' ? `pnpm dev --port ${APP_PORT} --strictPort` : `pnpm preview`,
    port: APP_PORT,
  },
  {
    workers: '100%',
    retries: 0,
  },
);

export default config;
