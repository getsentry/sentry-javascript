import { getPlaywrightConfig } from '@sentry-internal/test-utils';

export default getPlaywrightConfig(
  {
    startCommand: 'pnpm preview',
    port: 8787,
  },
  {
    workers: '100%',
    retries: 0,
  },
);
