import { sentrySvelteKit } from '@sentry/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sentrySvelteKit({ autoUploadSourceMaps: false }), sveltekit()],
  build: {
    rollupOptions: {
      external: id => {
        // External Node.js native modules
        if (id === 'fsevents') return true;

        return false;
      },
    },
  },
});
