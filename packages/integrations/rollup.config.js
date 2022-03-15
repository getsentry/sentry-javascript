import commonjs from '@rollup/plugin-commonjs';

import { insertAt, makeBaseBundleConfig, makeConfigVariants } from '../../rollup.config';

const builds = [];

const file = process.env.INTEGRATION_FILE;

const baseBundleConfig = makeBaseBundleConfig({
  input: `src/${file}`,
  isAddOn: true,
  jsVersion: 'es5',
  licenseTitle: '@sentry/integrations',
  // TODO this doesn't currently need to be a template string, but soon will need to be, so leaving it in that form
  // for now
  outputFileBase: `${file.replace('.ts', '')}`,
});

// TODO We only need `commonjs` for localforage (used in the offline plugin). Once that's fixed, this can come out.
baseBundleConfig.plugins = insertAt(baseBundleConfig.plugins, -2, commonjs());

builds.push(...makeConfigVariants(baseBundleConfig));

export default builds;
