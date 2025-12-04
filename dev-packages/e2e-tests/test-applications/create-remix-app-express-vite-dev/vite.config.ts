import { installGlobals } from '@remix-run/node';
import { vitePlugin as remix } from '@remix-run/dev';
import { sentryRemixVitePlugin } from '@sentry/remix';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

installGlobals();

export default defineConfig({
  plugins: [
    remix(),
    sentryRemixVitePlugin(),
    tsconfigPaths({
      // The dev server config errors are not relevant to this test app
      // https://github.com/aleclarson/vite-tsconfig-paths?tab=readme-ov-file#options
      ignoreConfigErrors: true,
    }),
  ],
});
