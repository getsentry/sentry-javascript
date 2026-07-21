import { reactRouter } from '@react-router/dev/vite';
import { sentryReactRouter } from '@sentry/react-router';
import { defineConfig } from 'vite';

export default defineConfig(async config => ({
  plugins: [
    reactRouter(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((await sentryReactRouter(
      {
        sourcemaps: { disable: true },
        // Auto-inject server instrumentation into the build output - no `NODE_OPTIONS='--import ...'` needed.
        autoInjectServerInstrumentation: true,
      },
      config,
    )) as any[]),
  ],
}));
