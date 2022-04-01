import { makeBaseBundleConfig, makeConfigVariants } from '../../rollup.config';

const baseBundleConfig = makeBaseBundleConfig({
  input: 'src/index.ts',
  isAddOn: true,
  jsVersion: 'es5',
  licenseTitle: '@sentry/wasm',
  outputFileBase: 'bundles/wasm',
});

export default makeConfigVariants(baseBundleConfig);
