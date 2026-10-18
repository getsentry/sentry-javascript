import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// `worker/index.ts` contains no Sentry calls: in a vinext build the plugin wraps it with `withSentry` from
// `@sentry/nextjs/cloudflare`.
export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({ viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] } }),
    sentryCloudflareVitePlugin(),
  ],
});
