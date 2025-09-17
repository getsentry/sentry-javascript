import { fileURLToPath } from 'node:url';
import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const nuxtConfigOptions = {
  nuxt: {
    rootDir: fileURLToPath(new URL('.', import.meta.url)),
  },
};

const config = getPlaywrightConfig({
  startCommand: `pnpm start:import`,
  use: { ...nuxtConfigOptions },
});

export default config;
