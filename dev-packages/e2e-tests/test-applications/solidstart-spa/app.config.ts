import { sentrySolidStartVite } from '@sentry/solidstart';
import { defineConfig } from '@solidjs/start/config';

export default defineConfig({
  ssr: false,
  vite: {
    plugins: [sentrySolidStartVite()],
  },
});
