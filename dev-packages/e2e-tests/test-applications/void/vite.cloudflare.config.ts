import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';
import { voidPlugin } from 'void';

// The app has no wrangler config and no Sentry calls. Void generates the Worker entry (`.void/entry.ts`),
// and the Sentry plugin wraps it at build time.
// Void does not install `wrangler`. It is a dev dependency because `@sentry/cloudflare/vite` imports it.
export default defineConfig({
  plugins: [voidPlugin(), sentryCloudflareVitePlugin()],
});
