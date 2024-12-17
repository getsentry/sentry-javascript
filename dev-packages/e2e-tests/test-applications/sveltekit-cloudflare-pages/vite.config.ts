import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

export default defineConfig({
  plugins: [sentrySvelteKit({ autoUploadSourceMaps: false }), sveltekit()],
});
