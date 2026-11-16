import { getPlaywrightConfig } from '@sentry-internal/test-utils';

export default getPlaywrightConfig({
  startCommand: process.env.TEST_ENV === 'development' ? `HOST=localhost pnpm exec vite dev --port 3030` : `pnpm start`,
});
