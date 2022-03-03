import { makeBaseBundleConfig, terserPlugin } from '../../rollup.config';

const baseBundleConfig = makeBaseBundleConfig({
  input: 'src/index.ts',
  isAddOn: true,
  jsVersion: 'es5',
  licenseTitle: '@sentry/wasm',
  outputFileBase: 'build/wasm',
});

function loadAllIntegrations() {
  const builds = [];
  [
    {
      extension: '.js',
      plugins: baseBundleConfig.plugins,
    },
    {
      extension: '.min.js',
      plugins: [...baseBundleConfig.plugins, terserPlugin],
    },
  ].forEach(build => {
    builds.push({
      ...baseBundleConfig,
      output: {
        ...baseBundleConfig.output,
        file: `${baseBundleConfig.output.file}${build.extension}`,
      },
      plugins: build.plugins,
    });
  });
  return builds;
}

export default loadAllIntegrations();
