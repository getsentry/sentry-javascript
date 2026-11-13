import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

// Only the Cloudflare variant builds with Vite. It bundles the `nest build` output, which has the
// decorator metadata Nest needs for dependency injection.
export default defineConfig({
  build: { outDir: 'dist-cloudflare' },
  plugins: [cloudflare(), sentryCloudflareVitePlugin()],
});
