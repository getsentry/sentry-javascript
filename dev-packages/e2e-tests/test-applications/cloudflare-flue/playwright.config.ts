import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const config = getPlaywrightConfig(
  // `dev` is vite's dev server; `preview` serves the built worker through wrangler. Both run under
  // workerd, so both exercise the build-time registration this app exists to prove.
  { startCommand: testEnv === 'development' ? 'pnpm dev' : 'pnpm preview', port: 4112 },
  { timeout: 90_000 },
);

export default config;
