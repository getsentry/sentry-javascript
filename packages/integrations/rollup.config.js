import * as fs from 'fs';

import commonjs from '@rollup/plugin-commonjs';

import { makeBaseBundleConfig, terserPlugin } from '../../rollup.config';

function allIntegrations() {
  return fs.readdirSync('./src').filter(file => file != 'index.ts');
}

function loadAllIntegrations() {
  const builds = [];

  allIntegrations().forEach(file => {
    const baseBundleConfig = makeBaseBundleConfig({
      input: `src/${file}`,
      isAddOn: true,
      jsVersion: 'es5',
      licenseTitle: '@sentry/integrations',
      outputFileBase: `build/${file.replace('.ts', '')}`,
    });

    [
      {
        extension: '.js',
        plugins: [...baseBundleConfig.plugins, commonjs()],
      },
      {
        extension: '.min.js',
        plugins: [...baseBundleConfig.plugins, commonjs(), terserPlugin],
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
  });

  return builds;
}

export default loadAllIntegrations();
