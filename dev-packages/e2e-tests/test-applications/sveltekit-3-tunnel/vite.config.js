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
});
