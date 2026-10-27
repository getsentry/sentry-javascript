import adapter from '@sveltejs/adapter-node';
import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// The tunnel variant serves the app under a base path to cover that the managed tunnel follows it.
const tunnelVariant = !!process.env.E2E_TEST_TUNNEL;

export default defineConfig({
  plugins: [
    sentrySvelteKit({
      autoUploadSourceMaps: false,
    }),
    // SvelteKit 3 no longer reads `svelte.config.js` - configuration is passed
    // directly to the `sveltekit()` Vite plugin instead.
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter(),
      // Enable SvelteKit's native server-side OpenTelemetry tracing so the Sentry
      // SDK picks up Kit's spans instead of starting its own `http.server` span.
      // `Sentry.init` consequently lives in `src/instrumentation.server.ts`, which
      // SvelteKit loads automatically (the `experimental.instrumentation` flag was
      // removed in 3.0.0-next.8, and `tracing` was promoted out of `experimental`).
      tracing: {
        server: true,
      },
      paths: tunnelVariant ? { base: '/app' } : undefined,
    }),
  ],
});
