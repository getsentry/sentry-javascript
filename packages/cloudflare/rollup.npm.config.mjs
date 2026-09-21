import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.ts', 'src/request.ts', 'src/vite/index.ts', 'src/orchestrion-diagnostics-channel.ts'],
    packageSpecificConfig: {
      output: {
        // make it so Rollup calms down about the fact that we're combining default and named exports
        exports: 'named',
      },
    },
  }),
  { splitDevProd: true },
);
