import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // `sentrySvelteKit()` wires up the orchestrion code transform automatically, so
    // instrumented DB drivers (mysql, ioredis) get `diagnostics_channel` publishers
    // injected into the SSR bundle with no manual plugin needed.
    sentrySvelteKit({
      autoUploadSourceMaps: false,
    }),

    sveltekit(),
  ],
});
