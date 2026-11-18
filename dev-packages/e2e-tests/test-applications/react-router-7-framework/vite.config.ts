import { reactRouter } from '@react-router/dev/vite';
import { sentryReactRouter } from '@sentry/react-router/vite';
import { defineConfig } from 'vite';

export default defineConfig(config => {
  return {
    plugins: [
      reactRouter(),
      sentryReactRouter(
        {
          release: { name: 'react-router-7-framework-e2e' },
          sourcemaps: { disable: true },
          // The app is instrumented at runtime by `instrument.mjs`, and only uses the plugin for the release.
          buildTimeInstrumentation: false,
        },
        config,
      ),
    ],
  };
});
