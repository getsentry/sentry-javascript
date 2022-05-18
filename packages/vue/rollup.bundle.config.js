import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  input: 'src/index.bundle.ts',
  jsVersion: 'es6',
  licenseTitle: '@sentry/vue',
  outputFileBase: 'bundle.vue',
});

export default makeBundleConfigVariants(baseBundleConfig);
