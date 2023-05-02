import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sentrySvelteKit({
      autoUploadSourceMaps: false,
    }),
    sveltekit(),
  ],
});
