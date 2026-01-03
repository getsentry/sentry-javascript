import { vitePlugin as remix } from '@remix-run/dev';
import { sentryRemixVitePlugin } from '@sentry/remix';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Enable Single Fetch types
declare module '@remix-run/node' {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ['**/.*'],
      serverModuleFormat: 'cjs',
      future: {
        v3_singleFetch: true,
      },
    }),
    sentryRemixVitePlugin(),
    tsconfigPaths(),
  ],
});
