import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// The suite runs twice, once per instrumentation path, the way `node-mastra` splits dev and prod:
//
//   production  - `dist/app.cjs`, whose Mistral, dataloader and express copies were transformed at
//                 build time by `sentryEsbuildPlugin`. `instrument.mjs` turns runtime injection off
//                 there, so the bundler plugin is the only thing that can have instrumented them.
//   development - unbundled ESM behind the runtime `--import` hook.
const isDev = process.env.TEST_ENV === 'development';

const config = getPlaywrightConfig({
  startCommand: isDev ? 'pnpm start' : 'pnpm start:bundled',
});

export default config;
