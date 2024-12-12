import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'addon',
  entrypoints: ['src/index.ts'],
  licenseTitle: '@sentry-internal/replay-canvas',
  outputFileBase: () => 'bundles/replay-canvas',
});

const builds = makeBundleConfigVariants(baseBundleConfig);

export default builds;
