import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

const builds = [];

['es5', 'es6'].forEach(jsVersion => {
  const baseBundleConfig = makeBaseBundleConfig({
    bundleType: 'standalone',
    entrypoints: ['src/index.bundle.ts'],
    jsVersion,
    licenseTitle: '@sentry/tracing & @sentry/browser',
    outputFileBase: () => `bundles/bundle.tracing${jsVersion === 'es5' ? '.es5' : ''}`,
  });

  builds.push(...makeBundleConfigVariants(baseBundleConfig));
});

export default builds;
