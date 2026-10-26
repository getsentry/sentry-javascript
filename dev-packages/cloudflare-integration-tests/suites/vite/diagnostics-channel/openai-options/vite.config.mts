import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // The worker calls `withSentry()` itself to pass its own integration
  // options, so this suite tests only the orchestrion transform.
  plugins: [cloudflare(), sentryCloudflareVitePlugin({ autoInstrumentation: false })],
});
