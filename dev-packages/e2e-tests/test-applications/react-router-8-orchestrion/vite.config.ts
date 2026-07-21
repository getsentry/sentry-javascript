import { reactRouter } from '@react-router/dev/vite';
import { sentryReactRouter } from '@sentry/react-router';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import { defineConfig } from 'vite';

export default defineConfig(async config => ({
  plugins: [
    reactRouter(),
    // Runs the orchestrion code transform over the SSR server bundle and
    // force-bundles the instrumented deps (mysql, ioredis, …) so the
    // diagnostics-channel calls are actually injected at build time.
    sentryOrchestrionPlugin(),
    // Auto-injects `instrument.server.mjs` into the server build output (top-level import),
    // so no manual `import '../instrument.server.mjs'` or `--import` flag is needed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((await sentryReactRouter(
      {
        sourcemaps: { disable: true },
        autoInjectServerInstrumentation: true,
      },
      config,
    )) as any[]),
  ],
}));
