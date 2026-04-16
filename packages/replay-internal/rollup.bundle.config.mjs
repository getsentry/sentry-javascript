import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const baseBundleOptions = {
  bundleType: 'addon',
  entrypoints: ['src/index.ts'],
  licenseTitle: '@sentry-internal/replay',
  outputFileBase: () => 'bundles/replay',
};

const builds = makeBundleConfigVariants(() => makeBaseBundleConfig(baseBundleOptions));

export default builds;
