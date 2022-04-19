import { makeBaseBundleConfig, makeConfigVariants } from '../../rollup/index.js';

const baseBundleConfig = makeBaseBundleConfig({
  input: 'src/index.bundle.ts',
  isAddOn: false,
  jsVersion: 'es5',
  licenseTitle: '@sentry/vue',
  outputFileBase: 'bundle.vue',
});

export default makeConfigVariants(baseBundleConfig);
