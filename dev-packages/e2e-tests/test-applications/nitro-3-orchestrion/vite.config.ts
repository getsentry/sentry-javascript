import { sentryVitePlugin } from '@sentry/node/vite';
import { nitroRuntimeConfig } from '@sentry/server-utils/orchestrion/config';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    nitro(),
    sentryVitePlugin({
      instrumentations: nitroRuntimeConfig,
      telemetry: false,
      sourcemaps: { disable: true },
      release: { create: false, finalize: false, inject: false },
    }),
  ],
});
