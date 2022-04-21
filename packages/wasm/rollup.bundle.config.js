import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

const baseBundleConfig = makeBaseBundleConfig({
  input: 'src/index.ts',
  isAddOn: true,
  jsVersion: 'es6',
  licenseTitle: '@sentry/wasm',
  outputFileBase: 'bundles/wasm',
});

export default makeBundleConfigVariants(baseBundleConfig);
