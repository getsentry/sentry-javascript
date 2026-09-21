import sentry from '@sentry/sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sentry({
      autoUploadSourceMaps: false,
    }),
    sveltekit(),
  ],
});
