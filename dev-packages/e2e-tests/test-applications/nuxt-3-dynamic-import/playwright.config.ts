import { getPlaywrightConfig } from '@sentry-internal/test-utils';

/*  Make sure to import from '@nuxt/test-utils/playwright' in the tests
 *  Like this: import { expect, test } from '@nuxt/test-utils/playwright' */

const config = getPlaywrightConfig({
  startCommand: `pnpm start`,
});

export default config;
