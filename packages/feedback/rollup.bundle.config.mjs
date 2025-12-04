import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

// Alias react to preact/compat since this package uses Preact for rendering
const preactAlias = {
  resolve: {
    alias: {
      react: 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
};

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
      packageSpecificConfig: preactAlias,
    }),
  ),
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/modal/integration.tsx'],
      jsVersion: 'es6',
      licenseTitle: '@sentry-internal/feedback',
      outputFileBase: () => 'bundles/feedback-modal',
      packageSpecificConfig: preactAlias,
    }),
  ),
];
