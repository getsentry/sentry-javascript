import { vitePlugin as remix } from '@remix-run/dev';
import Sentry from '@sentry/remix';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ['**/.*'],
      serverModuleFormat: 'cjs',
    }),
    Sentry.sentryRemixVitePlugin(),
    tsconfigPaths(),
  ],
});
