import { vitePlugin as remix } from '@remix-run/dev';
import { sentryRemixVitePlugin } from '@sentry/remix';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const injectOrchestrion = process.env.INJECT_ORCHESTRION === 'true';

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ['**/.*'],
    }),
    sentryRemixVitePlugin(),
    // In the orchestrion variant, run the orchestrion code transform over the SSR
    // server bundle and force-bundle the instrumented deps (mysql, ioredis,
    // @remix-run/server-runtime, …) so their diagnostics-channel calls are injected
    // at build time.
    ...(injectOrchestrion ? [sentryOrchestrionPlugin()] : []),
    tsconfigPaths(),
  ],
});
