import { makeBaseNPMConfig, makeNPMConfigVariants, makeOrchestrionLoader } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/index.server.ts',
        'src/index.client.ts',
        'src/client/index.ts',
        'src/server/index.ts',
        'src/vite/index.ts',
      ],
      packageSpecificConfig: {
        output: {
          // make it so Rollup calms down about the fact that we're combining default and named exports
          exports: 'named',
        },
      },
    }),
  ),
  ...makeOrchestrionLoader('./build'),
];
