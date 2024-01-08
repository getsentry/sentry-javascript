import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare'
import sentry from '@sentry/astro'

// https://astro.build/config
export default defineConfig({
  output: 'hybrid',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  integrations: [
    sentry({
      dsn: '',
      autoInstrumentation: {
        requestHandler: true,
      },
      sourceMapsUploadOptions: {
        enabled: false,
      },
      clientInitPath: 'sentry.client.mjs',
      serverInitPath: 'sentry.server.mjs',
    }),
  ],
});
