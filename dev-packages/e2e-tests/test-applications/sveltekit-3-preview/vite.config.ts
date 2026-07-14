import { sentrySvelteKit } from '@sentry/sveltekit';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sentrySvelteKit({
      autoUploadSourceMaps: false,
    }),
    sveltekit({
      adapter: adapter(),
      preprocess: vitePreprocess(),
    }),
  ],
});
