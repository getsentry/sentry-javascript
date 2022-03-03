import { makeBaseBundleConfig, terserPlugin } from '../../rollup.config';

const builds = [];

['es5', 'es6'].forEach(jsVersion => {
  const baseBundleConfig = makeBaseBundleConfig({
    input: 'src/index.ts',
    isAddOn: false,
    jsVersion,
    licenseTitle: '@sentry/browser',
    outputFileBase: `build/bundle${jsVersion === 'es6' ? '.es6' : ''}`,
  });

  builds.push(
    ...[
      {
        ...baseBundleConfig,
        output: {
          ...baseBundleConfig.output,
          file: `${baseBundleConfig.output.file}.js`,
        },
        plugins: [...baseBundleConfig.plugins],
      },
      {
        ...baseBundleConfig,
        output: {
          ...baseBundleConfig.output,
          file: `${baseBundleConfig.output.file}.min.js`,
        },
        plugins: [...baseBundleConfig.plugins, terserPlugin],
      },
    ],
  );
});

export default builds;
