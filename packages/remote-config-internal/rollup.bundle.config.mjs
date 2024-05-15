import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'addon',
  entrypoints: ['src/index.ts'],
  licenseTitle: '@sentry-internal/remote-config',
  outputFileBase: () => 'bundles/remote-config',
});

const builds = makeBundleConfigVariants(baseBundleConfig);

export default builds;
