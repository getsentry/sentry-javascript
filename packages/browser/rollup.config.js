import { makeBaseBundleConfig, makeLicensePlugin, terserPlugin } from '../../rollup.config';

const builds = [];

const licensePlugin = makeLicensePlugin();

['es5', 'es6'].forEach(jsVersion => {
  const baseBundleConfig = makeBaseBundleConfig({
    input: 'src/index.ts',
    isAddOn: false,
    jsVersion,
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
