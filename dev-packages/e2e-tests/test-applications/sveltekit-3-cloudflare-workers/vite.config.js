import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import adapter from '@sveltejs/adapter-cloudflare';
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
    // SvelteKit 3 no longer reads `svelte.config.js` — configuration is passed
    // directly to the `sveltekit()` Vite plugin instead.
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter(),
      prerender: {
        handleHttpError: 'ignore',
      },
      paths: tunnelVariant ? { base: '/app' } : undefined,
    }),
  ],
});
