import { makeBaseBundleConfig, makeLicensePlugin, terserPlugin } from '../../rollup.config';

const licensePlugin = makeLicensePlugin('@sentry/tracing & @sentry/browser');

const baseBundleConfig = makeBaseBundleConfig({
  input: 'src/index.bundle.ts',
  isAddOn: false,
  jsVersion: 'es5',
  outputFileBase: 'build/bundle.tracing',
});

export default [
  // ES5 Browser Tracing Bundle
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
];
