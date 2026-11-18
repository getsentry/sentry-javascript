import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// The static trace lifecycle variant sets this to `static`.
process.env.E2E_TEST_TRACE_LIFECYCLE ??= 'stream';

const config = getPlaywrightConfig({
  startCommand: 'pnpm preview --port 4173',
  port: 4173,
});

export default config;
