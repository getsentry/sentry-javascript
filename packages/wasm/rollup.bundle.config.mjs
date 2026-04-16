import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const baseBundleOptions = {
  bundleType: 'addon',
  entrypoints: ['src/index.ts'],
  licenseTitle: '@sentry/wasm',
  outputFileBase: () => 'bundles/wasm',
};

export default makeBundleConfigVariants(() => makeBaseBundleConfig(baseBundleOptions));
