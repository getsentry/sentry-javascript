import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'addon',
  entrypoints: ['src/index.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry-internal/feedback',
  outputFileBase: () => 'bundles/feedback',
});

const builds = makeBundleConfigVariants(baseBundleConfig);

export default builds;
