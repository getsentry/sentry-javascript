import { makeBaseBundleConfig } from '@sentry-internal/rollup-utils';

export default [
  makeBaseBundleConfig({
    bundleType: 'lambda-extension',
    entrypoints: ['src/lambda-extension/index.ts'],
    outputFileBase: 'index.mjs',
    packageSpecificConfig: {
      output: {
        dir: 'build/aws/dist-serverless/sentry-extension',
        sourcemap: false,
      },
    },
  }),
];
