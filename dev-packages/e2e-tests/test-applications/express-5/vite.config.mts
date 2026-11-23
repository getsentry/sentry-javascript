import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

// Only the Cloudflare variant builds with Vite.
export default defineConfig({
  build: { outDir: 'dist-cloudflare' },
  plugins: [cloudflare(), sentryCloudflareVitePlugin()],
});
