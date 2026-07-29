import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import agents from 'agents/vite';
import { defineConfig } from 'vite';

// `agents()` supplies the TC39 decorator transform that `@callable()` needs.
// `autoInstrumentation` is the plugin under test: it rewrites `src/index.ts` at
// build time so the entry itself contains no Sentry calls.
export default defineConfig({
  plugins: [
    agents(),
    cloudflare(),
    sentryCloudflareVitePlugin({
      _experimental: {
        autoInstrumentation: true,
      },
    }),
  ],
});
