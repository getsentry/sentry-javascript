import { vitePlugin as remix } from '@remix-run/dev';
import { sentryRemixVitePlugin } from '@sentry/remix/vite';
import { defineConfig } from 'vite';

// `manual-upload`: Sentry uploads nothing and keeps the maps it turned on, for an upload with the CLI.
// `delete-all`: the app turns source maps on itself, and Sentry removes them.
const variant = process.env.E2E_VARIANT;

export default defineConfig({
  build: variant === 'delete-all' ? { sourcemap: true } : undefined,
  plugins: [
    remix({
      ignoredRouteFiles: ['**/.*'],
    }),
    sentryRemixVitePlugin({
      authToken: process.env.E2E_NO_UPLOAD ? undefined : 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      sentryUrl: 'http://localhost:3033',
      release: {
        name: 'test-release',
      },
      debug: true,
      sourcemaps:
        variant === 'manual-upload'
          ? { upload: false, delete: false }
          : variant === 'delete-all'
            ? { delete: true }
            : undefined,
    }),
  ],
});
