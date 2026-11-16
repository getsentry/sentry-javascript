import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';

const getStartCommand = () => {
  if (process.env.TEST_ENV === 'development') {
    // `astro dev` ignores PORT.
    return 'pnpm exec astro dev --port 3030';
  }
  if (getRuntime() !== 'cloudflare') {
    return 'pnpm start';
  }
  return process.env.E2E_TEST_CF_PAGES
    ? 'pnpm exec wrangler pages dev ./dist --port 3030'
    : 'pnpm exec wrangler dev --port 3030';
};

export default getPlaywrightConfig({ startCommand: getStartCommand() });
