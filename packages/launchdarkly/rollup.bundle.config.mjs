import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'addon',
  entrypoints: ['src/index.ts'],
  licenseTitle: '@sentry/launchdarkly',
  outputFileBase: () => 'bundles/launchdarkly',
});

const builds = makeBundleConfigVariants(baseBundleConfig);

export default builds;
