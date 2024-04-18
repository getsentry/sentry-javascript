import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/index.bundle.ts'],
      jsVersion: 'es6',
      licenseTitle: '@sentry-internal/feedback',
      outputFileBase: () => 'bundles/feedback',
      sucrase: {
        jsxPragma: 'h',
        jsxFragmentPragma: 'Fragment',
      },
    }),
  ),
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/screenshot/integration.ts'],
      jsVersion: 'es6',
      licenseTitle: '@sentry-internal/feedback',
      outputFileBase: () => 'bundles/feedback-screenshot',
      sucrase: {
        jsxPragma: 'h',
        jsxFragmentPragma: 'Fragment',
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
      sucrase: {
        jsxPragma: 'h',
        jsxFragmentPragma: 'Fragment',
      },
    }),
  ),
];
