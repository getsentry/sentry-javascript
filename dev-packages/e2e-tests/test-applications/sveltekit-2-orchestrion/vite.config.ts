import { sentrySvelteKit } from '@sentry/sveltekit';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sentrySvelteKit({
      autoUploadSourceMaps: false,
    }),

    // Runs the orchestrion code transform on the SvelteKit SSR bundle so
    // instrumented DB drivers (mysql, ioredis) get `diagnostics_channel`
    // publishers injected at build time.
    sentryOrchestrionPlugin(),

    sveltekit(),
  ],
});
