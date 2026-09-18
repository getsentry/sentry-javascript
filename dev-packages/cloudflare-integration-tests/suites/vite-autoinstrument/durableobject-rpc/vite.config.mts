import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // The Sentry transform wraps the entry before the Cloudflare plugin bundles it.
  plugins: [cloudflare(), sentryCloudflareVitePlugin()],
});
