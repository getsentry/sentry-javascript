import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  // The core `feedback` bundle is built in the browser package
  // Sub-bundles are built here
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/screenshot/integration.ts'],
      jsVersion: 'es6',
      licenseTitle: '@sentry-internal/feedback',
      outputFileBase: () => 'bundles/feedback-screenshot',
      esbuild: {
        // The feedback widget uses preact, so override esbuild's React defaults.
        jsxFactory: 'h',
        jsxFragment: 'Fragment',
      },
    }),
  ),
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/modal/integration.tsx'],
      jsVersion: 'es6',
      licenseTitle: '@sentry-internal/feedback',
      outputFileBase: () => 'bundles/feedback-modal',
      esbuild: {
        // The feedback widget uses preact, so override esbuild's React defaults.
        jsxFactory: 'h',
        jsxFragment: 'Fragment',
      },
    }),
  ),
];
