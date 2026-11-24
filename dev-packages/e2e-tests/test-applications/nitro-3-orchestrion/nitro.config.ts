import { sentryRollupPlugin } from '@sentry/node/rollup';
import { defineConfig } from 'nitro';

const sentryPluginOptions = {
  telemetry: false,
  sourcemaps: { disable: true },
  release: { create: false, finalize: false, inject: false },
} as const;

// Shared by Nitro's Vite plugin (`vite dev`/`vite build`) and the Nitro CLI (`nitro dev`/`nitro build`).
export default defineConfig({
  serverDir: './server',
  // Turns on h3's native tracing channels, so the native path and the orchestrion path both run.
  tracingChannel: !!process.env.E2E_NITRO_TRACING_CHANNEL,
  rollupConfig: {
    // Nitro's Vite plugin also adds these plugins to the Vite build, where `sentryVitePlugin` already
    // transforms the same modules.
    plugins: process.env.NITRO_BUILDER ? [sentryRollupPlugin(sentryPluginOptions)] : [],
  },
});
