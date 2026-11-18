import { withSentryConfig } from '@sentry/nitro';
import { defineConfig } from 'nitro';

// Shared by Nitro's Vite plugin (`vite dev`/`vite build`) and the Nitro CLI (`nitro dev`/`nitro build`).
export default withSentryConfig(
  defineConfig({
    serverDir: './server',
    experimental: { tasks: true },
  }),
);
