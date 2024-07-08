import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/index.ts'],
      jsVersion: 'es6',
      licenseTitle: '@sentry-internal/feedback',
      outputFileBase: () => 'bundles/feedback',
      sucrase: {
        // The feedback widget is using preact so we need different pragmas and jsx runtimes
        jsxPragma: 'h',
        jsxFragmentPragma: 'Fragment',
        jsxRuntime: 'classic',
      },
    }),
  ),
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/core/integration.ts'],
      jsVersion: 'es6',
      licenseTitle: '@sentry-internal/feedback-core',
      outputFileBase: () => 'bundles/feedback-core',
      sucrase: {
        // The feedback widget is using preact so we need different pragmas and jsx runtimes
        jsxPragma: 'h',
        jsxFragmentPragma: 'Fragment',
        jsxRuntime: 'classic',
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
        // The feedback widget is using preact so we need different pragmas and jsx runtimes
        jsxPragma: 'h',
        jsxFragmentPragma: 'Fragment',
        jsxRuntime: 'classic',
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
        // The feedback widget is using preact so we need different pragmas and jsx runtimes
        jsxPragma: 'h',
        jsxFragmentPragma: 'Fragment',
        jsxRuntime: 'classic',
      },
    }),
  ),
];
