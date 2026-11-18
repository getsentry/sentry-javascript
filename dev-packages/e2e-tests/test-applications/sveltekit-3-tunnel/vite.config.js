import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import nodeAdapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const cloudflare = process.env.RUNTIME === 'cloudflare';

export default defineConfig({
  plugins: [
    sentrySvelteKit({ autoUploadSourceMaps: false }),
    sveltekit({
      adapter: cloudflare ? cloudflareAdapter() : nodeAdapter(),
      // On Node, Kit's own tracing starts the request spans, and the SDK inits in `src/instrumentation.server.ts`.
      tracing: { server: !cloudflare },
      paths: { base: '/app' },
    }),
  ],
  // `@sveltejs/adapter-cloudflare` 8.0.3 applies the Cloudflare Vite plugin's dependency optimization to the
  // SSR environment, which pre-bundles `@sveltejs/kit/hooks` with its own copy of Kit's request store. In
  // `vite dev`, `sequence()` then throws "Could not get the request store", with or without the SDK.
  environments: cloudflare ? { ssr: { optimizeDeps: { exclude: ['@sveltejs/kit'] } } } : undefined,
});
