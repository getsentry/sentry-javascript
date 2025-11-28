import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

const variants = makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.server.ts', 'src/index.client.ts', 'src/integration/middleware/index.ts'],
    packageSpecificConfig: {
      output: {
        dynamicImportInCjs: true,
        exports: 'named',
      },
    },
    // Astro is Node 18+ no need to add polyfills
    addPolyfills: false,
  }),
);

export default [...variants, ...makeOtelLoaders('./build', 'sentry-node')];
