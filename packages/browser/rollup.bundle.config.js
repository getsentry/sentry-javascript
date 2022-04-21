import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

const builds = [];

['es5', 'es6'].forEach(jsVersion => {
  const baseBundleConfig = makeBaseBundleConfig({
    input: 'src/index.ts',
    isAddOn: false,
    jsVersion,
    licenseTitle: '@sentry/browser',
    outputFileBase: `bundles/bundle${jsVersion === 'es5' ? '.es5' : ''}`,
  });

  builds.push(...makeBundleConfigVariants(baseBundleConfig));
});

export default builds;
