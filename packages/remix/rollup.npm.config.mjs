import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.server.ts', 'src/index.client.tsx'],
      packageSpecificConfig: {
        external: ['react-router', 'react-router-dom'],
        output: {
          // make it so Rollup calms down about the fact that we're combining default and named exports
          exports: 'named',
        },
      },
    }),
  ),
  ...makeOtelLoaders('./build', 'sentry-node'),
];
