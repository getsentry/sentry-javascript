import { makeBaseBundleConfig, makeMinificationVariants } from '../../rollup.config';

const baseBundleConfig = makeBaseBundleConfig({
  input: 'src/index.ts',
  isAddOn: true,
  jsVersion: 'es5',
  licenseTitle: '@sentry/wasm',
  outputFileBase: 'build/wasm',
});

export default makeMinificationVariants(baseBundleConfig);
