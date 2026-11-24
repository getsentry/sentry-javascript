import { sentryRollupPlugin } from '@sentry/node/rollup';
import { nitroRuntimeConfig } from '@sentry/server-utils/orchestrion/config';
import { defineConfig } from 'nitro';

// Shared by Nitro's Vite plugin (`vite dev`/`vite build`) and the Nitro CLI (`nitro dev`/`nitro build`).
export default defineConfig({
  serverDir: './server',
  experimental: { tasks: true },
  // Croner takes a seconds field, so the scheduled task runs every second.
  scheduledTasks: { '* * * * * *': ['test-scheduled'] },
  rollupConfig: {
    // Nitro's Vite plugin also adds these plugins to the Vite build, where `sentryVitePlugin` already
    // transforms the same modules.
    plugins: process.env.NITRO_BUILDER
      ? [
          sentryRollupPlugin({
            instrumentations: nitroRuntimeConfig,
            telemetry: false,
            sourcemaps: { disable: true },
            release: { create: false, finalize: false, inject: false },
          }),
        ]
      : [],
  },
});
