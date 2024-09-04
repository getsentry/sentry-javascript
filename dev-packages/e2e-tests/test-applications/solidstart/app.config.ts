import { sentrySolidStartVite } from '@sentry/solidstart';
import { defineConfig } from '@solidjs/start/config';

export default defineConfig({
  vite: {
    plugins: [sentrySolidStartVite()],
    server: {
      hmr: false
    }
  },
});
