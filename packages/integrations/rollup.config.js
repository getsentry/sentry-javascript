import commonjs from '@rollup/plugin-commonjs';

import { insertAt, makeBaseBundleConfig, makeConfigVariants } from '../../rollup.config';

const builds = [];

const file = process.env.INTEGRATION_FILE;
const jsVersion = process.env.JS_VERSION;

const baseBundleConfig = makeBaseBundleConfig({
  input: `src/${file}`,
  isAddOn: true,
  jsVersion,
  licenseTitle: '@sentry/integrations',
  outputFileBase: `bundles/${file.replace('.ts', '')}${jsVersion === 'ES6' ? '.es6' : ''}`,
});

// TODO We only need `commonjs` for localforage (used in the offline plugin). Once that's fixed, this can come out.
baseBundleConfig.plugins = insertAt(baseBundleConfig.plugins, -2, commonjs());

// this makes non-minified, minified, and minified-with-debug-logging versions of each bundle
builds.push(...makeConfigVariants(baseBundleConfig));

export default builds;
