import { version } from '$app/environment';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sentrySvelteKit({
      autoUploadSourceMaps: false,
      sourceMapsUploadOptions: {
        release: version,
      },
    }),
    sveltekit(),
  ],
});
