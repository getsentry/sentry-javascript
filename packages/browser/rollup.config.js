import { makeBaseBundleConfig, makeMinificationVariants } from '../../rollup.config';

const builds = [];

['es5', 'es6'].forEach(jsVersion => {
  const baseBundleConfig = makeBaseBundleConfig({
    input: 'src/index.ts',
    isAddOn: false,
    jsVersion,
    licenseTitle: '@sentry/browser',
    outputFileBase: `build/bundle${jsVersion === 'es6' ? '.es6' : ''}`,
  });

  builds.push(...makeMinificationVariants(baseBundleConfig));
});

export default builds;
