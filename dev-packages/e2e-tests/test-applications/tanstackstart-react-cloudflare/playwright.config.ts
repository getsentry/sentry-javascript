import { getPlaywrightConfig } from '@sentry-internal/test-utils';

export default getPlaywrightConfig({
  startCommand: 'pnpm preview',
  port: 8787,
});
