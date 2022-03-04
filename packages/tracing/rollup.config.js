import { makeBaseBundleConfig, makeLicensePlugin, terserPlugin } from '../../rollup.config';

const builds = [];

const licensePlugin = makeLicensePlugin('@sentry/tracing & @sentry/browser');

['es5', 'es6'].forEach(jsVersion => {
  const baseBundleConfig = makeBaseBundleConfig({
    input: 'src/index.bundle.ts',
    isAddOn: false,
    jsVersion,
    outputFileBase: `build/bundle.tracing${jsVersion === 'es6' ? '.es6' : ''}`,
  });

  builds.push(
    ...[
      {
        ...baseBundleConfig,
        output: {
          ...baseBundleConfig.output,
          file: `${baseBundleConfig.output.file}.js`,
        },
        plugins: [...baseBundleConfig.plugins, licensePlugin],
      },
      {
        ...baseBundleConfig,
        output: {
          ...baseBundleConfig.output,
          file: `${baseBundleConfig.output.file}.min.js`,
        },
        plugins: [...baseBundleConfig.plugins, terserPlugin, licensePlugin],
      },
    ],
  );
});

export default builds;
