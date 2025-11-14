import { sentrySvelteKit } from '@sentry/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sentrySvelteKit({
      autoUploadSourceMaps: false,
    }),
    sveltekit(),
  ],
  // https://github.com/sveltejs/kit/issues/11416
  build: {
    rollupOptions: {
      external: ['fsevents'],
    },
  },
});
