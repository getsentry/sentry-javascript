import cloudflare from '@astrojs/cloudflare';
import sentry from '@sentry/astro';
import { defineConfig } from 'astro/config';

const dsn = process.env.E2E_TEST_DSN;

// https://astro.build/config
export default defineConfig({
  output: 'hybrid',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  integrations: [
    sentry({
      enabled: Boolean(dsn),
      dsn,
      sourceMapsUploadOptions: {
        enabled: false,
      },
      // purposefully setting the default name for client
      // and a custom name for server to test both cases
      serverInitPath: 'sentry.server.mjs',
    }),
  ],
});
