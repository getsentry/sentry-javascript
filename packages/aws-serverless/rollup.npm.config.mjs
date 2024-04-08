import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // TODO: `awslambda-auto.ts` is a file which the lambda layer uses to automatically init the SDK. Does it need to be
      // in the npm package? Is it possible that some people are using it themselves in the same way the layer uses it (in
      // which case removing it would be a breaking change)? Should it stay here or not?
      entrypoints: ['src/index.ts', 'src/awslambda-auto.ts'],
      // packages with bundles have a different build directory structure
      hasBundles: true,
    }),
    { emitEsm: false },
  ),
  ...makeOtelLoaders('./build', 'sentry-node'),
];
