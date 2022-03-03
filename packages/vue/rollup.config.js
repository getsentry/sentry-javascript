import { makeBaseBundleConfig, terserPlugin } from '../../rollup.config';

const baseBundleConfig = makeBaseBundleConfig({
  input: 'src/index.bundle.ts',
  isAddOn: false,
  jsVersion: 'es5',
  licenseTitle: '@sentry/vue',
  outputFileBase: 'build/bundle.vue',
});

export default [
  {
    ...baseBundleConfig,
    output: {
      ...baseBundleConfig.output,
      file: `${baseBundleConfig.output.file}.js`,
    },
    plugins: baseBundleConfig.plugins,
  },
  {
    ...baseBundleConfig,
    output: {
      ...baseBundleConfig.output,
      file: `${baseBundleConfig.output.file}.min.js`,
    },
    plugins: [...baseBundleConfig.plugins, terserPlugin],
  },
];
