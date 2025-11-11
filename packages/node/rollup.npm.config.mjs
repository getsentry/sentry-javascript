import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

export default [
  ...makeOtelLoaders('./build', 'otel'),
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.ts', 'src/init.ts', 'src/preload.ts'],
      packageSpecificConfig: {
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
          preserveModules: true,
        },
      },
    }),
  ),
];
