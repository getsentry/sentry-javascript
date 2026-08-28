import { makeBaseNPMConfig, makeNPMConfigVariants, makeOrchestrionLoader } from '@sentry-internal/rollup-utils';

// The handler shim (loaded by the AWS Lambda runtime via the redirected `_HANDLER`) is
// built as a standalone, ESM-only bundle: it uses top-level await to load the user's
// handler module, which cannot be expressed in the CJS variant. Relative imports are
// bundled into the file; bare imports (`@sentry/*`, node builtins) stay external and
// resolve against the installed package at runtime.
function makeHandlerShimConfig() {
  const baseConfig = makeBaseNPMConfig({
    entrypoints: ['src/run-lambda-handler.ts'],
    // Top-level await requires es2022.
    packageSpecificConfig: { transform: { target: 'es2022' } },
  });

  return {
    ...baseConfig,
    output: {
      ...baseConfig.output,
      dir: undefined,
      file: 'build/npm/run-lambda-handler.mjs',
      format: 'esm',
      preserveModules: false,
    },
  };
}

export default [
  makeHandlerShimConfig(),
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // TODO: `awslambda-auto.ts` is a file which the lambda layer uses to automatically init the SDK. Does it need to be
      // in the npm package? Is it possible that some people are using it themselves in the same way the layer uses it (in
      // which case removing it would be a breaking change)? Should it stay here or not?
      entrypoints: ['src/index.ts', 'src/awslambda-auto.ts'],
      // packages with bundles have a different build directory structure
      hasBundles: true,
      packageSpecificConfig: {
        output: {
          preserveModulesRoot: 'src',
        },
      },
    }),
  ),
  ...makeOrchestrionLoader('./build'),
];
