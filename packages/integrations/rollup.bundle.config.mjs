import commonjs from '@rollup/plugin-commonjs';

import { insertAt, makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const builds = [];

const file = process.env.INTEGRATION_FILE;
const jsVersion = process.env.JS_VERSION;

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'addon',
  entrypoints: [`src/${file}`],
  jsVersion,
  licenseTitle: '@sentry/integrations',
  outputFileBase: ({ name: entrypoint }) => `bundles/${entrypoint}${jsVersion === 'es5' ? '.es5' : ''}`,
});

// TODO We only need `commonjs` for localforage (used in the offline plugin). Once that's fixed, this can come out.
// CommonJS plugin docs: https://github.com/rollup/plugins/tree/master/packages/commonjs
baseBundleConfig.plugins = insertAt(baseBundleConfig.plugins, -2, commonjs());

// this makes non-minified, minified, and minified-with-debug-logging versions of each bundle
builds.push(...makeBundleConfigVariants(baseBundleConfig));

export default builds;
