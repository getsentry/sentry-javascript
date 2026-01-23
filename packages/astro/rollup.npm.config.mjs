import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

const variants = makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.server.ts', 'src/index.client.ts', 'src/integration/middleware.ts'],
    packageSpecificConfig: {
      output: {
        dynamicImportInCjs: true,
        exports: 'named',
      },
    },
  }),
);

export default [...variants, ...makeOtelLoaders('./build', 'sentry-node')];
