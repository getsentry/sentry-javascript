import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

// Builds the Cloudflare variant (`src/entry.cloudflare.ts`, per `wrangler.toml`). The Node variant runs
// straight from source via tsx and does not use this config.
export default defineConfig({
  plugins: [cloudflare(), sentryCloudflareVitePlugin()],
});
