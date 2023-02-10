import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

const builds = [];

['es5', 'es6'].forEach(jsVersion => {
  const baseBundleConfig = makeBaseBundleConfig({
    bundleType: 'standalone',
    entrypoints: ['src/index.ts'],
    jsVersion,
    licenseTitle: '@sentry/browser',
    outputFileBase: () => `bundles/bundle${jsVersion === 'es5' ? '.es5' : ''}`,
  });

  builds.push(...makeBundleConfigVariants(baseBundleConfig));
});

// Full bundle incl. replay only available for es6
const replayBaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry/browser & @sentry/replay',
  outputFileBase: () => 'bundles/bundle.replay',
  includeReplay: true,
});

builds.push(...makeBundleConfigVariants(replayBaseBundleConfig));

export default builds;
