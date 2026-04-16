import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const baseBundleOptions = {
  bundleType: 'addon',
  entrypoints: ['src/index.ts'],
  licenseTitle: '@sentry-internal/replay-canvas',
  outputFileBase: () => 'bundles/replay-canvas',
};

const builds = makeBundleConfigVariants(() => makeBaseBundleConfig(baseBundleOptions));

export default builds;
