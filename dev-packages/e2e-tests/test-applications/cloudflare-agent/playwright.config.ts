import { getPlaywrightConfig } from '@sentry-internal/test-utils';

export default getPlaywrightConfig({
  testDir: './tests',
  port: 4173,
  startCommand: 'pnpm preview',
  use: {
    baseURL: 'http://localhost:4173',
  },
});
