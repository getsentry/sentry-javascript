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
    }),
  ],
});
