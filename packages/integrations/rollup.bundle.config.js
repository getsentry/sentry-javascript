import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

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

// this makes non-minified, minified, and minified-with-debug-logging versions of each bundle
builds.push(...makeBundleConfigVariants(baseBundleConfig));

export default builds;
