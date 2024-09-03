import { defineConfig } from '@solidjs/start/config';
import { sentrySolidStartVite } from '@sentry/solidstart';

export default defineConfig({
  vite: {
    plugins: [
      sentrySolidStartVite({}),
    ]
  }
});
