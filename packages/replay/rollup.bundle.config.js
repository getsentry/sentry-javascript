import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'addon',
  entrypoints: ['src/index.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry/replay',
  outputFileBase: () => 'bundles/replay',
});

const builds = makeBundleConfigVariants(baseBundleConfig);

export default builds;
