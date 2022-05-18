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

export default builds;
