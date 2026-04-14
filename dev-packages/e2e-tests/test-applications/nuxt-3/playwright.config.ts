import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  // VERCEL=1 triggers flushIfServerless() to actually flush events,
  // preventing flaky tests where transactions don't arrive in time
  startCommand: `VERCEL=1 pnpm start:import`,
});

export default config;
