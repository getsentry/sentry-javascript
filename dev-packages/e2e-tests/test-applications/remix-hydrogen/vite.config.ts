import { vitePlugin as remix } from '@remix-run/dev';
import { sentryRemixVitePlugin } from '@sentry/remix';
import { hydrogen } from '@shopify/hydrogen/vite';
import { oxygen } from '@shopify/mini-oxygen/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    hydrogen(),
    oxygen(),
    remix({
      presets: [hydrogen.preset()],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    sentryRemixVitePlugin(),
    tsconfigPaths({
      // The dev server config errors are not relevant to this test app
      // https://github.com/aleclarson/vite-tsconfig-paths?tab=readme-ov-file#options
      ignoreConfigErrors: true,
    }),
  ],
  build: {
    // Allow a strict Content-Security-Policy
    // without inlining assets as base64:
    assetsInlineLimit: 0,
    minify: false,
  },
  ssr: {
    optimizeDeps: {
      /**
       * Include dependencies here if they throw CJS<>ESM errors.
       * For example, for the following error:
       *
       * > ReferenceError: module is not defined
       * >   at /Users/.../node_modules/example-dep/index.js:1:1
       *
       * Include 'example-dep' in the array below.
       * @see https://vitejs.dev/config/dep-optimization-options
       */
      include: ['hoist-non-react-statics', '@sentry/remix'],
    },
  },
});
