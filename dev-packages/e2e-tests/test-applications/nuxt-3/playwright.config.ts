import { fileURLToPath } from 'node:url';
import type { ConfigOptions } from '@nuxt/test-utils/playwright';
import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const nuxtConfigOptions: ConfigOptions = {
  nuxt: {
    rootDir: fileURLToPath(new URL('.', import.meta.url)),
  },
};

const config = getPlaywrightConfig({
  startCommand: `pnpm preview`,
  use: { ...nuxtConfigOptions },
});

export default config;
