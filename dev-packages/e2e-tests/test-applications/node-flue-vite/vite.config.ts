import { flue } from '@flue/vite';
import { sentryVitePlugin } from '@sentry/node/vite';
import { defineConfig } from 'vite';

// Set up as https://docs.sentry.io/platforms/javascript/guides/node/sourcemaps/uploading/vite/ describes,
// on top of what `flue init` scaffolds. Only the mock Sentry server's URL and a fixed release name are test-specific.
export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    flue(),
    sentryVitePlugin({
      org: 'test-org',
      project: 'test-project',
      authToken: 'fake-auth-token',
      url: 'http://localhost:3032',
      release: { name: 'test-release' },
      sourcemaps: {
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
    }),
  ],
});
