import { reactRouter } from '@react-router/dev/vite';
import { hydrogen } from '@shopify/hydrogen/vite';
import { oxygen } from '@shopify/mini-oxygen/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { sentryReactRouter, type SentryReactRouterBuildOptions } from '@sentry/react-router';

const sentryConfig: SentryReactRouterBuildOptions = {
  org: 'example-org',
  project: 'example-project',
  // An auth token is required for uploading source maps;
  // store it in an environment variable to keep it secure.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // ...
};

export default defineConfig(config => ({
  plugins: [
    hydrogen(),
    oxygen(),
    reactRouter(),
    sentryReactRouter(sentryConfig, config),
    tsconfigPaths({
      // The dev server config errors are not relevant to this test app
      // https://github.com/aleclarson/vite-tsconfig-paths?tab=readme-ov-file#options
      ignoreConfigErrors: true,
    }),
  ],
  // build: {
  //   // Allow a strict Content-Security-Policy
  //   // without inlining assets as base64:
  //   assetsInlineLimit: 0,
  //   minify: false,
  // },
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
      include: ['hoist-non-react-statics', '@sentry/react-router'],
    },
  },
}));
