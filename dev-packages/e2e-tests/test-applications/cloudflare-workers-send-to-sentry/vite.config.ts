import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

// The Sentry plugin wraps the default export of `src/index.ts` with `withSentry` at build time and
// takes the options from `src/instrument.server.ts`, so the entry itself stays uninstrumented.
export default defineConfig({
  plugins: [cloudflare(), sentryCloudflareVitePlugin()],
});
