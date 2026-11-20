import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

// On Cloudflare, `sentryCloudflareVitePlugin` wraps the Worker entry with `withSentry` and reads the options from
// `instrument.server.ts` next to the wrangler config, so `start.serverSetup` is not used.
export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    solid({
      start: { clientSetup: './src/instrument.client.ts' },
      ssr: true,
      serverFunctions: true,
      observe: process.env.SOLID_OBSERVE === '1',
    }),
    sentryCloudflareVitePlugin(),
  ],
  build: {
    target: 'esnext',
  },
  envPrefix: 'PUBLIC_',
});
