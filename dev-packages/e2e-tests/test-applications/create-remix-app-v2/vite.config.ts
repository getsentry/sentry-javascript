import { vitePlugin as remix } from '@remix-run/dev';
import { sentryRemixVitePlugin } from '@sentry/remix/vite';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ['**/.*'],
    }),
    sentryRemixVitePlugin(),
    // Run the orchestrion code transform over the SSR server bundle and force-bundle the
    // instrumented deps (mysql, ioredis, @remix-run/server-runtime, …) so their
    // diagnostics-channel calls are injected at build time.
    sentryOrchestrionPlugin(),
    tsconfigPaths(),
  ],
});
