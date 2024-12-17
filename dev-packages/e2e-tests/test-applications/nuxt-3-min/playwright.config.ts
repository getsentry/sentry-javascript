import { fileURLToPath } from 'node:url';
import type { ConfigOptions } from '@nuxt/test-utils/playwright';
import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const nuxtConfigOptions: ConfigOptions = {
  nuxt: {
    rootDir: fileURLToPath(new URL('.', import.meta.url)),
  },
};

/*  Make sure to import from '@nuxt/test-utils/playwright' in the tests
 *  Like this: import { expect, test } from '@nuxt/test-utils/playwright' */

const config = getPlaywrightConfig({
  startCommand: `pnpm start:import`,
  use: { ...nuxtConfigOptions },
});

export default config;
