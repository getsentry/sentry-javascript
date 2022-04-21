import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

const baseBundleConfig = makeBaseBundleConfig({
  input: 'src/index.bundle.ts',
  isAddOn: false,
  jsVersion: 'es6',
  licenseTitle: '@sentry/vue',
  outputFileBase: 'bundle.vue',
});

export default makeBundleConfigVariants(baseBundleConfig);
