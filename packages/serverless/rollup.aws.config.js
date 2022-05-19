import { makeBaseBundleConfig, makeBundleConfigVariants, makeBaseNPMConfig } from '../../rollup/index.js';

// TODO: Right now we're generating all three versions of the bundle, but we should only generate one. Can't bypass the
// variant-making function (the way we do with the wrapper file below) without duplicting a bunch of code, so probably
// need a new option here. Maybe just pass in your own variant, rather than the info to make one or pick one?

// TODO: Is anyone ever going to be interacting with this code, running a debugger or looking at it? If not, we should
// probably shut off sourcemaps and might as well ship the minified bundle rather than the regular one. If so, we should
// also copy in the license and readme files.

export default [
  // const configs = [

  // The SDK
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'node',
      entrypoints: ['src/index.awslambda.ts'],
      jsVersion: 'es6',
      licenseTitle: '@sentry/serverless',
      outputFileBase: () => 'index',
      packageSpecificConfig: {
        output: {
          // dir: 'build/aws/dist-serverless/nodejs/node_modules/@sentry/serverless/dist',
          dir: 'build/aws/dist-serverless/nodejs/node_modules/@sentry/serverless/build/cjs',
        },
      },
    }),
  ),

  // This builds a wrapper file, which our lambda layer integration automatically sets up to run as soon as node
  // launches (via the `NODE_OPTIONS="-r @sentry/serverless/dist/awslambda-auto"` variable). Note the inclusion in this
  // path of the legacy `dist` folder; for backwards compatibility, in the build script we'll copy the file there.
  makeBaseNPMConfig({
    entrypoints: ['src/awslambda-auto.ts'],
    packageSpecificConfig: {
      // Normally `makeNPMConfigVariants` sets both of these values for us, but we don't actually want the ESM variant,
      // and the directory structure is different than normal, so we have to do it ourselves.
      output: {
        format: 'cjs',
        // dir: 'build/aws/dist-serverless/nodejs/node_modules/@sentry/serverless/dist',
        dir: 'build/aws/dist-serverless/nodejs/node_modules/@sentry/serverless/build/cjs',
      },
      // We only want `awslambda-auto.js`, not the modules that it imports, because they're all included in the bundle
      // we generate above
      external: ['./index'],
    },
  }),
];

// console.log(configs);
// debugger;
//
// export default configs;

// TODO: Pick a system - symlink or futzing with `package.json` - and use the appropriate comment below, and the
// correct `dir` value above and below.

// A wrapper file, which our lambda layer integration automatically sets up to run as soon as node launches, via the
// `NODE_OPTIONS="-r @sentry/serverless/dist/awslambda-auto"` variable. Note the inclusion in this path of the legacy
// `dist` folder; for backwards compatibility, we still use that directory setup here, and just change the entry point
// in the `package.json` the build script copies in.
