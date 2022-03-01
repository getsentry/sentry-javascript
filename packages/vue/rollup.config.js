import { makeBaseBundleConfig, makeLicensePlugin, terserPlugin } from '../../rollup.config';

const licensePlugin = makeLicensePlugin();

const baseBundleConfig = makeBaseBundleConfig({
  input: 'src/index.bundle.ts',
  isAddOn: false,
  jsVersion: 'es5',
  outputFileBase: 'build/bundle.vue',
});

export default [
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
