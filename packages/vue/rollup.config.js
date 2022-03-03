import { makeBaseBundleConfig, makeMinificationVariants } from '../../rollup.config';

const baseBundleConfig = makeBaseBundleConfig({
  input: 'src/index.bundle.ts',
  isAddOn: false,
  jsVersion: 'es5',
  licenseTitle: '@sentry/vue',
  outputFileBase: 'build/bundle.vue',
});

export default makeMinificationVariants(baseBundleConfig);
