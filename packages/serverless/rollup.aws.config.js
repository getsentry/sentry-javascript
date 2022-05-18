import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'node',
  entrypoints: ['src/index.awslambda.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry/serverless',
  outputFileBase: () => 'aws/dist-serverless/nodejs/node_modules/@sentry/serverless/build/cjs/index',
});

export default makeBundleConfigVariants(
  baseBundleConfig,
  // Because this bundle is only being used for the lambda layer, we don't need log-less and/or minified versions
  { makeAllVariants: false },
);
