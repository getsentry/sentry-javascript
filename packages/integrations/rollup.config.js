import * as fs from 'fs';

import commonjs from '@rollup/plugin-commonjs';

import { insertAt, makeBaseBundleConfig, makeMinificationVariants } from '../../rollup.config';

const builds = [];

const integrationSourceFiles = fs.readdirSync('./src').filter(file => file != 'index.ts');

integrationSourceFiles.forEach(file => {
  const baseBundleConfig = makeBaseBundleConfig({
    input: `src/${file}`,
    isAddOn: true,
    jsVersion: 'es5',
    licenseTitle: '@sentry/integrations',
    outputFileBase: `build/${file.replace('.ts', '')}`,
  });

  // TODO We only need `commonjs` for localforage (used in the offline plugin). Once that's fixed, this can come out.
  baseBundleConfig.plugins = insertAt(baseBundleConfig.plugins, -2, commonjs());

  builds.push(...makeMinificationVariants(baseBundleConfig));
});

export default builds;
