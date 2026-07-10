import { reactRouter } from '@react-router/dev/vite';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    reactRouter(),
    // Runs the orchestrion code transform over the SSR server bundle and
    // force-bundles the instrumented deps (mysql, ioredis, …) so the
    // diagnostics-channel calls are actually injected at build time.
    sentryOrchestrionPlugin(),
  ],
});
