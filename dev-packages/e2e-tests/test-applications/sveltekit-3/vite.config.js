import adapter from '@sveltejs/adapter-node';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

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
      // `Sentry.init` consequently lives in `src/instrumentation.server.ts`.
      experimental: {
        instrumentation: {
          server: true,
        },
        tracing: {
          server: true,
        },
      },
    }),
  ],
});
