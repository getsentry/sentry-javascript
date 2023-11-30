import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.mjs';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'addon',
  entrypoints: ['src/index.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry/wasm',
  outputFileBase: () => 'bundles/wasm',
});

export default makeBundleConfigVariants(baseBundleConfig);
