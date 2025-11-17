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
    }),
  ),
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/modal/integration.tsx'],
      jsVersion: 'es6',
      licenseTitle: '@sentry-internal/feedback',
      outputFileBase: () => 'bundles/feedback-modal',
    }),
  ),
];
