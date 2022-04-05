import { makeBaseBundleConfig, makeConfigVariants } from '../../rollup.config';

const builds = [];

['es5', 'es6'].forEach(jsVersion => {
  const baseBundleConfig = makeBaseBundleConfig({
    input: 'src/index.bundle.ts',
    isAddOn: false,
    jsVersion,
    licenseTitle: '@sentry/tracing & @sentry/browser',
    outputFileBase: `bundles/bundle.tracing${jsVersion === 'es6' ? '.es6' : ''}`,
  });

  builds.push(...makeConfigVariants(baseBundleConfig));
});

export default builds;
