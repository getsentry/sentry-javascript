import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

// `vite build` runs the Sentry auto-instrument transform over the worker entry: it wraps the default
// export (the Hono app) with `withSentry` and injects the orchestrion channels that the
// `honoIntegration` default subscribes to. `wrangler dev` (via the plugin's `.wrangler/deploy`
// redirect) then serves the built output.
export default defineConfig({
  plugins: [cloudflare(), sentryCloudflareVitePlugin()],
});
