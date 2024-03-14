import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

export default makeBundleConfigVariants(
  makeBaseBundleConfig({
    bundleType: 'addon',
    entrypoints: ['src/index.ts'],
    jsVersion: 'es6',
    licenseTitle: '@sentry-internal/feedback',
    outputFileBase: () => 'bundles/feedback',
    sucrase: {
      jsxPragma: 'h',
      jsxFragmentPragma: 'Fragment',
    },
  }),
);
