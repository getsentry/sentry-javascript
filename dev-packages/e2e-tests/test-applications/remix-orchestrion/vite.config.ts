import { vitePlugin as remix } from '@remix-run/dev';
import { sentryRemixVitePlugin } from '@sentry/remix';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ['**/.*'],
      serverModuleFormat: 'cjs',
    }),
    sentryRemixVitePlugin(),
    // Runs the orchestrion code transform over the SSR server bundle and
    // force-bundles the instrumented deps (mysql, ioredis, …) so the
    // diagnostics-channel calls are actually injected at build time.
    sentryOrchestrionPlugin(),
    tsconfigPaths(),
  ],
});
