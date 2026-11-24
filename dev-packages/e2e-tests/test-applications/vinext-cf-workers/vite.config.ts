import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { workersCacheCdnAdapter } from '@vinext/cloudflare/cache/workers-cache-cdn-adapter';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// `worker/index.ts` contains no Sentry calls: in a vinext build the plugin wraps it with `withSentry` from
// `@sentry/nextjs/cloudflare`.
export default defineConfig({
  plugins: [
    // The `vinext-cf-workers (workers cache)` variant renders cacheable pages in the `VinextCachedResponse`
    // entrypoint, which the default export calls through `ctx.exports`.
    vinext(process.env.E2E_VINEXT_WORKERS_CACHE ? { cache: { cdn: workersCacheCdnAdapter() } } : {}),
    cloudflare({ viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] } }),
    sentryCloudflareVitePlugin(),
  ],
});
