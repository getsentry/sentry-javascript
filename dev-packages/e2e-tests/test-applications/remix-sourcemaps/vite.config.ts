import { vitePlugin as remix } from '@remix-run/dev';
import { sentryRemixVitePlugin } from '@sentry/remix/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ['**/.*'],
    }),
    sentryRemixVitePlugin({
      authToken: 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      sentryUrl: 'http://localhost:3033',
      release: {
        name: 'test-release',
      },
      debug: true,
    }),
  ],
});
