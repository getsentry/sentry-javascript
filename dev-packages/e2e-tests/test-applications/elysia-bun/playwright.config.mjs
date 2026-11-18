import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// The static trace lifecycle variant sets this to `static`.
process.env.E2E_TEST_TRACE_LIFECYCLE ??= 'stream';

const config = getPlaywrightConfig({
  startCommand: 'bun src/app.ts',
});

export default config;
