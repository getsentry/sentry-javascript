import { makeBaseBundleConfig, makeBaseNPMConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  // The SDK
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      // this automatically sets it to be CJS
      bundleType: 'node',
      entrypoints: ['src/index.ts'],
      licenseTitle: '@sentry/aws-serverless',
      outputFileBase: () => 'index',
      packageSpecificConfig: {
        output: {
          dir: 'build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/cjs',
          sourcemap: false,
        },
      },
    }),
    // We only need one copy of the SDK, and we pick the minified one because there's a cap on how big a lambda function
    // plus its dependencies can be, and we might as well take up as little of that space as is necessary. We'll rename
    // it to be `index.js` in the build script, since it's standing in for the index file of the npm package.
    { variants: ['.min.js'] },
  ),
  makeBaseNPMConfig({
    entrypoints: ['src/awslambda-auto.ts'],
    packageSpecificConfig: {
      // Normally `makeNPMConfigVariants` sets both of these values for us, but we don't actually want the ESM variant,
      // and the directory structure is different than normal, so we have to do it ourselves.
      output: {
        format: 'cjs',
        dir: 'build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/cjs',
        sourcemap: false,
      },
      // We only want `awslambda-auto.js`, not the modules that it imports, because they're all included in the bundle
      // we generate above
      external: ['./index'],
    },
  }),
];
