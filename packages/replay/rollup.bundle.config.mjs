import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'addon',
  entrypoints: ['src/integration.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry/replay',
  outputFileBase: () => 'bundles/replay',
});

const baseCanvasBundleConfig = makeBaseBundleConfig({
  bundleType: 'addon',
  entrypoints: ['src/canvas.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry/replaycanvas',
  outputFileBase: () => 'bundles/replaycanvas',
});

const builds = [...makeBundleConfigVariants(baseBundleConfig), ...makeBundleConfigVariants(baseCanvasBundleConfig)];

export default builds;
